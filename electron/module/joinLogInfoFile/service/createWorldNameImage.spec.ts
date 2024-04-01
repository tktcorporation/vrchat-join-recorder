import * as datefns from 'date-fns';
import * as exiftool from './../../lib/wrappedExifTool';
import { generateOGPImageBuffer } from './createWorldNameImage';

describe('generateOGPImageBuffer', () => {
  it('should return a buffer', async () => {
    const date = new Date();
    const result = (
      await generateOGPImageBuffer({
        worldName: 'test',
        date,
        imageWidth: 1200,
      })
    )._unsafeUnwrap();
    expect(result).toBeInstanceOf(Buffer);

    const exifData = (await exiftool.readExifByBuffer(result))._unsafeUnwrap();

    expect(exifData.Description).toBe('test');
    expect(exifData.ImageDescription).toBe('test');
    if (typeof exifData.DateTimeOriginal !== 'object') {
      throw new Error('DateTimeOriginal is not object');
    }
    expect(exifData.DateTimeOriginal.rawValue).toBe(
      datefns.format(date, 'yyyy:MM:dd HH:mm:ss'),
    );
    if (typeof exifData.DateTimeDigitized !== 'object') {
      throw new Error('DateTimeDigitized is not object');
    }
    expect(exifData.DateTimeDigitized.rawValue).toBe(
      datefns.format(date, 'yyyy:MM:dd HH:mm:ss'),
    );
    expect(exifData.OffsetTime).toBe(datefns.format(date, 'xxx'));
    expect(exifData.OffsetTimeOriginal).toBe(datefns.format(date, 'xxx'));
  });
  it('write-exif-data', async () => {
    const date = new Date();
    const buffer = (
      await generateOGPImageBuffer({
        worldName: 'test',
        date,
        imageWidth: 150,
      })
    )._unsafeUnwrap();
    // 書き込み
    const result = await exiftool.setExifToBuffer(buffer, {
      description: 'test',
      dateTimeOriginal: '2021:01:01 00:00:00',
      timezoneOffset: '+09:00',
    });
    const exifData = (
      await exiftool.readExifByBuffer(result._unsafeUnwrap())
    )._unsafeUnwrap();

    expect(exifData.Description).toBe('test');
    expect(exifData.ImageDescription).toBe('test');
    if (typeof exifData.DateTimeOriginal !== 'object') {
      throw new Error('DateTimeOriginal is not object');
    }
    expect(exifData.DateTimeOriginal.rawValue).toBe('2021:01:01 00:00:00');
    if (typeof exifData.DateTimeDigitized !== 'object') {
      throw new Error('DateTimeDigitized is not object');
    }
    expect(exifData.DateTimeDigitized.rawValue).toBe('2021:01:01 00:00:00');
    expect(exifData.OffsetTime).toBe('+09:00');
    expect(exifData.OffsetTimeOriginal).toBe('+09:00');
  });

  // cleanup
  afterAll(async () => {
    await exiftool.closeExiftoolInstance();
  });
});
