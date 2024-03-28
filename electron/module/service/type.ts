import * as datefns from 'date-fns';
import * as neverthrow from 'neverthrow';
import * as z from 'zod';

const photoFileNameRegex =
  /^VRChat_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}.\d{3}_\d{3,4}x\d{3,4}$/;
const PhotoFileNameSchema = z.string().regex(photoFileNameRegex);
type PhotoFileName = z.infer<typeof PhotoFileNameSchema>;
const photoFileNameWithExtRegex =
  /^VRChat_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}.\d{3}_\d{3,4}x\d{3,4}\.\w+$/;
const PhotoFileNameWithExtSchema = z.string().regex(photoFileNameWithExtRegex);
type PhotoFileNameWithExt = z.infer<typeof PhotoFileNameWithExtSchema>;
interface ParsedPhotoFileName {
  date: Date;
  resolution: {
    width: string;
    height: string;
  };
  ext: string | null;
}
const parsePhotoFileName = (
  photoFileName: PhotoFileName | PhotoFileNameWithExt,
): neverthrow.Result<ParsedPhotoFileName, string> => {
  const matches = photoFileName.match(
    /^VRChat_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2}).(\d{3})_(\d{3,4})x(\d{3,4})(?:\.(\w+))?$/,
  );
  if (!matches) {
    return neverthrow.err('parsePhotoFileName: matches is null');
  }

  // これらは local time
  const date = matches[1];
  const time = matches[2];
  const millisecond = matches[3];
  const width = matches[4];
  const height = matches[5];
  const ext = matches[6] ?? null;
  return neverthrow.ok({
    date: datefns.parse(
      `${date.slice(0, 4)}-${date.slice(5, 7)}-${date.slice(
        8,
        10,
      )} ${time.slice(0, 2)}:${time.slice(3, 5)}:${time.slice(
        6,
        8,
      )}.${millisecond}`,
      'yyyy-MM-dd HH:mm:ss.SSS',
      new Date(),
    ),
    resolution: {
      width,
      height,
    },
    ext,
  });
};

export { parsePhotoFileName, PhotoFileNameSchema };

export type { PhotoFileName, PhotoFileNameWithExt, ParsedPhotoFileName };
