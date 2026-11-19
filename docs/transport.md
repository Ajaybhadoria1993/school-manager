# Transport (2026-11-10)

A sidebar row **Transport** that opens three pages: **Vehicles**, **Drivers** and **Routes** (`/transport/vehicles|drivers|routes`; `/transport`
leads to the first). The user asked for "a Transport tab with the driver's details, the bus / vehicle number, the route, everything that
matters in the real world". It is a new, self-contained module: nothing that existed was changed except the menu, the route table and the
permissions catalogue (one more group).

## What is kept

- **Vehicle** (`Vehicle`): the school's own name for it (`number`, "Bus 1"), the plate (`registrationNumber`, "MP09 AB 1234"), the kind (bus, mini
  bus, van, auto / e-rickshaw, other), `seats`, make and model, and the last valid day of the four papers the law asks for: **insurance, fitness
  certificate, pollution (PUC), permit**. One plate and one number once per school, however spaced or cased (`registrationKey`, `numberKey`).
  In use / not in use (`isActive`).
- **Driver or attendant** (`CrewMember`, `role: driver | attendant`; an attendant is a conductor, bus aunty / uncle): name, mobile (10 digits,
  `+91`, spaces and dashes are read; one person per mobile in the school), emergency number, address, joined on, and for a driver the **driving
  licence number and the day it is valid till**. They do not sign in. Working / left.
- **Route** (`TransportRoute`): name, **vehicle, driver and attendant** (each optional, each from the school's own lists; a driver must be a
  driver, an attendant an attendant), when it leaves the first stop in the morning and the school in the afternoon, and the **stops in order**,
  each with a pick-up time, a drop time and the monthly fee for a child who boards there (empty = no fee, not 0). A vehicle or a person may be on
  more than one route (a morning and an evening one). Running / closed.
- All three are the school's own lists and last across years (year-free, listed in `YEAR_FREE_MODELS`); each is `tenantScope`d with an isolation test.

## Papers to renew

Each paper is **valid** (green), **ends within 30 days** (amber: "Ends in 10 days", "Ends today"), **ended** (red: "Ended 3 days ago") or **not
given** (grey). \`EXPIRY_SOON_DAYS\` and \`paperOf\` (service) decide; days are India days. \`GET /transport/summary\` counts the active vehicles,
seats, drivers, attendants, routes, stops, routes without a vehicle / driver, and lists every paper that has ended or ends within a month
(vehicles' papers and drivers' licences, nearest first); the Vehicles page says the vehicles' ones above its list, the Drivers page the licences.

## API (\`/api/v1/transport\`, backend/src/main/transport)

\`GET /summary\`; for each of \`vehicles\`, \`drivers\`, \`routes\`: \`GET\` (\`?search=&status=active|inactive|all\`, drivers also \`&role=\`), \`POST\`, \`PATCH /:id\`, \`DELETE /:id\`.
A vehicle or a person on a route cannot be deleted (409 \`VEHICLE_IN_USE\` / \`CREW_IN_USE\`): take them off the route or make them inactive; a route can always
be deleted. Other answers: 409 \`PLATE_TAKEN\`, \`VEHICLE_NUMBER_TAKEN\`, \`CREW_MOBILE_TAKEN\`, \`ROUTE_NAME_TAKEN\`; 400 \`TEAM_NOT_FOUND\` (a vehicle or person of another school, or the
wrong kind). No \`yearView\`: these records have no year.

## Who may use it (docs/permissions.md)

Two permissions for the staff kinds: \`transport.view\` (the three pages) and \`transport.manage\` (add and change; brings \`transport.view\`). The school admin and
the principal always. The **Transport in-charge** role starts with both (the module is new, so nobody loses anything); every other kind starts without.
Teachers and parents never reach these pages (\`requireSchoolPermission\`). The menu row shows only to those who may see it; the buttons Add / Change only to those who may change.

## Screens (FrontEnd-React)

\`pages/transport/{Vehicles,Drivers,Routes}.tsx\`, dialogs in \`components/transport/\` (VehicleDialog, CrewDialog, RouteDialog with the stops editor: add, remove, move up / down),
\`redux/api/transportApi.ts\` (one tag: every change makes the lists and the numbers stale), words in \`utils/transport.ts\` (\`paperWords\`, \`clock\`).
Each page: header with its Add button(s), four tiles, a search box and Active / Inactive / All chips, then the list (Vehicles and Drivers as tables with the papers as pills; Routes as cards).

## Tests

Backend \`transport/__tests__/transport.test.ts\` (papers, plates, mobiles, routes and their team, deleting, summary, permissions) and \`transport.isolation.test.ts\`; frontend
\`pages/transport/__tests__/Transport.test.tsx\`, \`navConfig\`. Real Chrome on the throwaway stack (\`e2e-transport.cjs\`, 6 steps): the admin adds a vehicle, a driver
and an attendant and a route (picking from the lists), the vehicle says which route it runs and cannot be deleted, a receptionist sees Transport only after \`transport.view\` and cannot change it.

## Students on a route, and the parent's bus (2026-11-19)

- **`RouteRider`** (`transport/models/RouteRider.ts`): one row per student: `studentId`, `routeId`, `stopName`. **A student has one bus** (unique `{tenantId, studentId}`): adding them to another
  route moves them. Year-free on purpose (`YEAR_FREE_MODELS`): a child keeps their bus and stop from one session to the next until the school changes it. The stop is kept **by name** (a route's stops
  have no id), so a stop renamed or taken off leaves the child on the route with `stopKnown: false` ("not on the route now") until the school chooses a stop again. A student who left (inactive) is not
  listed or counted; deleting a route takes its riders off.
- **Office API** (all `transport.manage`: seeing the students is part of changing who rides, so a receptionist with only `transport.view` does not get a student list):
  `GET /routes/:id/riders`, `POST /routes/:id/riders` `{ studentId, stopName }` (400 `STUDENT_NOT_FOUND`, 400 `STOP_NOT_FOUND`, 409 `ROUTE_CLOSED`), `DELETE /routes/:id/riders/:studentId` (404 `RIDER_NOT_FOUND`),
  `GET /students/search?q=` (each word of what is typed must be in the first name, last name or admission number; 15 at most; says the route a student already rides). The routes list carries `riders` (a count).
  Screen: **Routes** > the people button on a route card (shows the count) > *Students on Route 1*: search, pick the stop, **Add to route**; each rider has a bin; seats used out of the vehicle's seats.
- **Parent API** `GET /parent/children/:id/bus` (permission `child.transport`, parents only; the child must be the parent's own: `ParentService.childOf`, else 404). It gives the route (morning / afternoon start), the stop with its
  pick-up and drop times and fee, the vehicle (number, plate), the driver and attendant (name, mobile), and `tracking`: `enabled` (the vehicle has a driver link), `live` (the position, **only while the bus is live**), `lastSeenSeconds`.
  **Where a bus is when no trip runs is never given** (its night parking place is nobody's business): once it is not live the parent gets "last seen 3 hr ago" and no coordinates. A closed route, or a child on none, is `{ assigned: false }`.
  Screen: the child's page > **School bus** (`components/parent/ChildBus.tsx`): status (On the way / Not running now / Not started / Tracking is off), the details, a call link for the driver, and a map that follows the bus
  while it is live. **The page asks again every 10 seconds** (RTK Query polling, only while the bus can be followed and the tab is in view): the parent is not on the socket, so no room per bus has to be kept in step with
  who may watch which child.
- Permission `child.transport` (and `child.fees`, docs/fees.md) is **on by default for parents**; a school unticks it in Permissions. A school whose parents already have a saved Permissions row must tick it once.

## Not built (later)

- The **seats left** on a vehicle as a hard limit (the dialog shows seats used and turns red above them, nothing refuses), a student's **morning and afternoon on different routes**, the transport **fee billed** in the fees module (the
  stop's monthly fee is kept and shown to the parent, nothing bills it), the **ETA** ("arrives in 8 minutes": needs trip history and each stop's coordinates), a notice to the parent when the bus is near their stop.
- Trip / fuel / maintenance logs; a driver's own login; notices before a paper ends (the Vehicles and Drivers pages show them).
