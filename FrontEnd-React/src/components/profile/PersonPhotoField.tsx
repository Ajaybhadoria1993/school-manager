import { useGetPersonPhotoQuery, useRemovePersonPhotoMutation, useSavePersonPhotoMutation } from "../../redux/api/profileApi";
import type { PhotoPerson } from "../../types";
import { photoForm } from "../../utils/image";
import { PhotoPicker } from "./PhotoPicker";

/** A teacher's or a staff member's photo on the school's pages: saved as soon as it is chosen; only looked at without `canChange`. */
export function PersonPhotoField({ kind, id, name, canChange, label, className }: PhotoPerson & { name: string; canChange: boolean; label?: string; className?: string }) {
  const photo = useGetPersonPhotoQuery({ kind, id }).data?.data.photo ?? null;
  const [save, saving] = useSavePersonPhotoMutation();
  const [remove, removing] = useRemovePersonPhotoMutation();
  return (
    <PhotoPicker
      className={className}
      label={label}
      name={name}
      photo={photo}
      saving={saving.isLoading}
      removing={removing.isLoading}
      onPick={canChange ? (picture, fileName) => save({ kind, id, body: photoForm(picture, fileName) }).unwrap() : undefined}
      onRemove={canChange ? () => remove({ kind, id }).unwrap() : undefined}
    />
  );
}
