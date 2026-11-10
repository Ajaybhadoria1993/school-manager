import { Languages } from "lucide-react";
import { useAddTeacherToMediumMutation, useGetTeacherMediumsQuery } from "../../redux/api/timetableApi";
import { getApiError } from "../../utils/apiErrors";
import type { Teacher } from "../../types";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { useToast } from "../ui/toast-context";
import { Block, Row } from "./DetailBlocks";

/**
 * The mediums of the school and where this teacher teaches. Adding one gives them a record on that side with the login they already have, so
 * a teacher of both mediums signs in once and moves between them from the top bar.
 */
export function TeacherMediumsBlock({ teacher, readOnly, index }: { teacher: Teacher; readOnly: boolean; index: number }) {
  const { data } = useGetTeacherMediumsQuery(teacher.id);
  const [add, adding] = useAddTeacherToMediumMutation();
  const { push } = useToast();
  const mediums = data?.data.items ?? [];
  if (mediums.length === 0) return null;

  const addTo = (id: string, label: string) =>
    void add({ id: teacher.id, mediumId: id })
      .unwrap()
      .then(
        () => push("success", `${teacher.name} now teaches in ${label}`),
        (err) => push("error", getApiError(err)?.message ?? "Could not add them.")
      );

  return (
    <Block icon={Languages} tone="primary" title="Teaches in" index={index}>
      {mediums.map((m) => (
        <Row key={m.id} label={m.label}>
          {m.here ? (
            <Badge>This medium</Badge>
          ) : m.teaches ? (
            <Badge tone="success">Teaches here</Badge>
          ) : readOnly || !teacher.isActive ? (
            <span className="font-normal text-foreground-muted">No</span>
          ) : (
            <Button variant="outline" size="sm" aria-label={`Add to ${m.label}`} disabled={adding.isLoading} onClick={() => addTo(m.id, m.label)}>
              Add
            </Button>
          )}
        </Row>
      ))}
    </Block>
  );
}
