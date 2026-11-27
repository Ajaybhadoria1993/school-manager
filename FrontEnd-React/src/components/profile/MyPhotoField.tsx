import { useGetMyPhotoQuery, useRemoveMyPhotoMutation, useSaveMyPhotoMutation } from "../../redux/api/profileApi";
import { photoForm } from "../../utils/image";
import { PhotoPicker } from "./PhotoPicker";

/** The signed-in person's own photo: saved as soon as it is chosen (Settings > Personal details, and onboarding's Your profile). */
export function MyPhotoField({ name, label, optional }: { name: string; label?: string; optional?: boolean }) {
  const photo = useGetMyPhotoQuery().data?.data.photo ?? null;
  const [save, saving] = useSaveMyPhotoMutation();
  const [remove, removing] = useRemoveMyPhotoMutation();
  return (
    <PhotoPicker
      label={label}
      optional={optional}
      name={name}
      photo={photo}
      saving={saving.isLoading}
      removing={removing.isLoading}
      onPick={(picture, fileName) => save(photoForm(picture, fileName)).unwrap()}
      onRemove={() => remove().unwrap()}
    />
  );
}
