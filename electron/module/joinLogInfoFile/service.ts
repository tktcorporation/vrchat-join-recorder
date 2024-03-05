import path from 'path';
import * as datefns from 'date-fns';
import * as neverthrow from 'neverthrow';
import * as fs from '../lib/wrappedFs';

import * as vrchatLogService from '../service/vrchatLog/vrchatLog';
import { generateOGPImageBuffer } from './service/createWorldNameImage';

const removeAdjacentDuplicateWorldEntries = (
  worldJoinLogInfoList: vrchatLogService.WorldJoinLogInfo[],
): vrchatLogService.WorldJoinLogInfo[] => {
  worldJoinLogInfoList.sort((a, b) => {
    return datefns.compareAsc(
      new Date(
        Number(a.year),
        Number(a.month) - 1,
        Number(a.day),
        Number(a.hour),
        Number(a.minute),
        Number(a.second),
      ),
      new Date(
        Number(b.year),
        Number(b.month) - 1,
        Number(b.day),
        Number(b.hour),
        Number(b.minute),
        Number(b.second),
      ),
    );
  });

  // 隣接する重複を削除
  let previousWorldId: string | null = null;
  return worldJoinLogInfoList.filter((info, index) => {
    if (index === 0 || info.worldId !== previousWorldId) {
      previousWorldId = info.worldId;
      return true;
    }
    return false;
  });
};

/**
 * JoinInfoLog の作成対象になる WorldJoinLogInfo[] を取得する
 */
const getToCreateWorldJoinLogInfos =
  (settingStore: ReturnType<typeof getSettingStore>) =>
  async (): Promise<
    neverthrow.Result<vrchatLogService.WorldJoinLogInfo[], VRChatLogFileError>
  > => {

    const logFilesDir = getVRChatLogFilesDir(settingStore)();
    if (logFilesDir.error !== null) {
      // FIXME: neverthrow
      throw new Error(logFilesDir.error);
    }

    const logLinesResult = await vrchatLogService.getLogLinesFromDir({
      storedLogFilesDirPath: logFilesDir.storedPath,
      logFilesDir: logFilesDir.path,
    });
    if (logLinesResult.isErr()) {
      return neverthrow.err(logLinesResult.error);
    }
    let preprocessedWorldJoinLogInfoList =
      vrchatLogService.convertLogLinesToWorldJoinLogInfos(logLinesResult.value);

    // removeAdjacentDuplicateWorldEntriesFlag が true の場合は隣接する重複を削除
    if (settingStore.getRemoveAdjacentDuplicateWorldEntriesFlag()) {
      preprocessedWorldJoinLogInfoList = removeAdjacentDuplicateWorldEntries(
        preprocessedWorldJoinLogInfoList,
      );
    }

    const vrchatPhotoDir = vrchatPhotoService.getVRChatPhotoDir({
      storedPath: settingStore.getVRChatPhotoDir(),
    });
    if (vrchatPhotoDir.error !== null) {
      // FIXME: neverthrow
      throw new Error(vrchatPhotoDir.error);
    }

    const genYearMonthPath = (info: vrchatLogService.WorldJoinLogInfo) => {
      return path.join(vrchatPhotoDir.path, `${info.year}-${info.month}`);
    };
    const genfileName = (info: vrchatLogService.WorldJoinLogInfo) => {
      return `${vrchatLogService.convertWorldJoinLogInfoToOneLine(info)}.jpeg`;
    };

    // ログから抽出した作成できるファイルの情報から、すでに存在するファイルを除外
    preprocessedWorldJoinLogInfoList = preprocessedWorldJoinLogInfoList.filter(
      (info) => {
        return !fs.existsSyncSafe(
          path.join(genYearMonthPath(info), genfileName(info)),
        );
      },
    );

    return neverthrow.ok(preprocessedWorldJoinLogInfoList);
  };

const getToCreateMap = async (props: {
  vrchatPhotoDir: string;
  worldJoinLogInfoList: vrchatLogService.WorldJoinLogInfo[];
  imageWidth?: number;
  // 同じワールドに連続して複数回入った履歴を削除するかどうか
  removeAdjacentDuplicateWorldEntriesFlag: boolean;
}): Promise<
  neverthrow.Result<
    {
      info: vrchatLogService.WorldJoinLogInfo;
      yearMonthPath: string;
      fileName: string;
      content: Buffer;
    }[],
    Error
  >
> => {

  const genYearMonthPath = (info: vrchatLogService.WorldJoinLogInfo) => {
    return path.join(props.vrchatPhotoDir, `${info.year}-${info.month}`);
  };
  const genfileName = (info: vrchatLogService.WorldJoinLogInfo) => {
    return `${vrchatLogService.convertWorldJoinLogInfoToOneLine(info)}.jpeg`;
  };

  const worldJoinLogInfoList = await getToCreateWorldJoinLogInfos(settingStore)();
  if (worldJoinLogInfoList.isErr()) {
    return neverthrow.err(worldJoinLogInfoList.error);
  }


  // ファイルの作成
  const toCreateMap: ({
    info: vrchatLogService.WorldJoinLogInfo;
    yearMonthPath: string;
    fileName: string;
    content: Buffer;
  } | null)[] = await Promise.all(
    worldJoinLogInfoList.value.map(async (info) => {
      const date = new Date(
        Number(info.year),
        Number(info.month) - 1,
        Number(info.day),
        Number(info.hour),
        Number(info.minute),
        Number(info.second),
      );

      // date は local time なので utc に変換
      // timezone は実行環境から取得する
      const diffMinsToUtc = date.getTimezoneOffset();
      const utcDate = datefns.addMinutes(date, diffMinsToUtc);

      const contentImage = await generateOGPImageBuffer({
        worldName: info.worldName,
        date: {
          year: Number(info.year),
          month: Number(info.month),
          day: Number(info.day),
        },
        exif: {
          dateTimeOriginal: utcDate,
        },
        imageWidth: props.imageWidth,
      });
      return {
        info,
        yearMonthPath: genYearMonthPath(info),
        fileName: genfileName(info),
        content: contentImage,
      };
    }),
  );
  const filteredMap = toCreateMap.filter((map) => map !== null) as Exclude<
    (typeof toCreateMap)[number],
    null
  >[];
  return neverthrow.ok(filteredMap);
};

const CreateFilesError = [
  'FAILED_TO_CREATE_YEAR_MONTH_DIR',
  'FAILED_TO_CREATE_FILE',
  'FAILED_TO_CHECK_YEAR_MONTH_DIR_EXISTS',
  'FAILED_TO_GET_TO_CREATE_MAP',
] as const;
const createFiles = async (props: {
  vrchatPhotoDir: string;
  worldJoinLogInfoList: vrchatLogService.WorldJoinLogInfo[];
  removeAdjacentDuplicateWorldEntriesFlag: boolean;
}): Promise<
  neverthrow.Result<
    void,
    { error: Error; type: (typeof CreateFilesError)[number] }
  >
> => {
  const toCreateMapResult = await getToCreateMap({
    vrchatPhotoDir: props.vrchatPhotoDir,
    worldJoinLogInfoList: props.worldJoinLogInfoList,
    removeAdjacentDuplicateWorldEntriesFlag:
      props.removeAdjacentDuplicateWorldEntriesFlag,
  });
  if (toCreateMapResult.isErr()) {
    return neverthrow.err({
      error: toCreateMapResult.error,
      type: 'FAILED_TO_GET_TO_CREATE_MAP',
    });
  }
  const toCreateMap = toCreateMapResult.value;

  // ディレクトリを作成(なければ)
  // yearMonthPath が重複している場合は一つにまとめる
  const yearMonthPathSet = new Set(toCreateMap.map((map) => map.yearMonthPath));
  for (const yearMonthPath of yearMonthPathSet) {
    const fileExistsResult = fs.existsSyncSafe(yearMonthPath);
    if (fileExistsResult.isErr()) {
      return neverthrow.err({
        error: fileExistsResult.error,
        type: 'FAILED_TO_CHECK_YEAR_MONTH_DIR_EXISTS',
      });
    }
    if (fileExistsResult.value !== true) {
      // ディレクトリが存在しない場合のみ作成を試みる
      const result = fs.mkdirSyncSafe(yearMonthPath); // recursiveオプションは不要
      if (result.isErr()) {
        return neverthrow.err({
          error: result.error,
          type: 'FAILED_TO_CREATE_YEAR_MONTH_DIR',
        });
      }
    }
  }

  // ファイルを作成
  for (const map of toCreateMap) {
    const result = fs.writeFileSyncSafe(
      path.join(map.yearMonthPath, map.fileName),
      map.content,
    );
    if (result.isErr()) {
      return neverthrow.err({
        error: result.error,
        type: 'FAILED_TO_CREATE_FILE',
      });
    }
  }

  return neverthrow.ok(undefined);
};

const groupingPhotoListByWorldJoinInfo = (
  worldJoinInfoList: {
    worldId: `wrld_${string}`;
    worldName: string;
    joinDatetime: Date;
  }[],
  vrcPhotoList: {
    photoPath: string;
    tookDatetime: Date;
  }[],
): {
  world: {
    worldId: `wrld_${string}`;
    worldName: string;
    joinDatetime: Date;
  };
  tookPhotoList: {
    photoPath: string;
    tookDatetime: Date;
  }[];
}[] => {
  const sortedWorldJoinInfoList = [...worldJoinInfoList].sort((a, b) => {
    return datefns.compareAsc(a.joinDatetime, b.joinDatetime);
  });
  return sortedWorldJoinInfoList.map((world, index) => {
    const nextWorldJoinDate =
      index < sortedWorldJoinInfoList.length - 1
        ? datefns.subSeconds(
            new Date(sortedWorldJoinInfoList[index + 1].joinDatetime),
            1,
          )
        : new Date();

    const tookPhotoList = vrcPhotoList.filter(
      (photo) =>
        datefns.isAfter(photo.tookDatetime, world.joinDatetime) &&
        datefns.isBefore(photo.tookDatetime, nextWorldJoinDate),
    );

    return {
      world,
      tookPhotoList,
    };
  });
};

export {
  createFiles,
  getToCreateMap,
  groupingPhotoListByWorldJoinInfo,
  removeAdjacentDuplicateWorldEntries,
};
