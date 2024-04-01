import path from 'node:path';
import * as datefns from 'date-fns';
import * as log from 'electron-log';
import * as neverthrow from 'neverthrow';
import { match } from 'ts-pattern';
import type { getSettingStore } from '../../module/settingStore';
import * as fs from '../lib/wrappedFs';
import { getService } from '../service';
import VRChatLogFileError from '../service/vrchatLog/error';
import * as vrchatLogService from '../service/vrchatLog/vrchatLog';
import VRChatPhotoFileError from '../service/vrchatPhoto/error';
import * as vrchatPhotoService from '../service/vrchatPhoto/service';
import { generateOGPImageBuffer } from './service/createWorldNameImage';

const removeAdjacentDuplicateWorldEntries = (
  worldJoinLogInfoList: vrchatLogService.WorldJoinLogInfo[],
): vrchatLogService.WorldJoinLogInfo[] => {
  worldJoinLogInfoList.sort((a, b) => {
    return datefns.compareAsc(a.date, b.date);
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

const genYearMonthPath = (
  vrchatPhotoDir: string,
  info: vrchatLogService.WorldJoinLogInfo,
) => {
  return path.join(vrchatPhotoDir, datefns.format(info.date, 'yyyy-MM'));
};
const genfileName = (info: vrchatLogService.WorldJoinLogInfo) => {
  return `${vrchatLogService.convertWorldJoinLogInfoToOneLine(info)}.jpeg`;
};

/**
 * JoinInfoLog の作成対象になる WorldJoinLogInfo[] を取得する
 */
const getToCreateWorldJoinLogInfos =
  (settingStore: ReturnType<typeof getSettingStore>) =>
  async (): Promise<
    neverthrow.Result<
      vrchatLogService.WorldJoinLogInfo[],
      VRChatLogFileError | VRChatPhotoFileError
    >
  > => {
    console.log('getToCreateWorldJoinLogInfos');
    const service = getService(settingStore);

    const logFilesDir = service.getVRChatLogFilesDir();
    if (logFilesDir.error !== null) {
      match(logFilesDir.error)
        .with('logFileDirNotFound', () =>
          neverthrow.err(new VRChatLogFileError('LOG_FILE_DIR_NOT_FOUND')),
        )
        .with('logFilesNotFound', () =>
          neverthrow.err(new VRChatLogFileError('LOG_FILES_NOT_FOUND')),
        )
        .exhaustive();
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

    const vrchatPhotoDir = service.getVRChatPhotoDir();
    if (vrchatPhotoDir.error !== null) {
      return match(vrchatPhotoDir.error)
        .with('photoDirReadError', () =>
          neverthrow.err(new VRChatPhotoFileError('PHOTO_DIR_READ_ERROR')),
        )
        .with('photoYearMonthDirsNotFound', () =>
          neverthrow.err(
            new VRChatPhotoFileError('PHOTO_YEAR_MONTH_DIRS_NOT_FOUND'),
          ),
        )
        .exhaustive();
    }

    // ログから抽出した作成できるファイルの情報から、すでに存在するファイルを除外
    preprocessedWorldJoinLogInfoList = preprocessedWorldJoinLogInfoList.filter(
      (info) => {
        const infoPath = path.join(
          genYearMonthPath(vrchatPhotoDir.path, info),
          genfileName(info),
        );
        const isPathAlreadyExistResult = fs.existsSyncSafe(infoPath);
        if (isPathAlreadyExistResult.isErr()) {
          log.error('isPathAlreadyExistResult', isPathAlreadyExistResult.error);
          return false;
        }
        const isPathAlreadyExist = isPathAlreadyExistResult.value;
        return !isPathAlreadyExist;
      },
    );

    console.log(
      'preprocessedWorldJoinLogInfoList',
      preprocessedWorldJoinLogInfoList.length,
    );

    return neverthrow.ok(preprocessedWorldJoinLogInfoList);
  };

const getToCreateMap =
  (settingStore: ReturnType<typeof getSettingStore>) =>
  async (props: {
    vrchatPhotoDir: string;
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
    const worldJoinLogInfoList =
      await getToCreateWorldJoinLogInfos(settingStore)();
    if (worldJoinLogInfoList.isErr()) {
      return neverthrow.err(worldJoinLogInfoList.error);
    }

    // ファイルの作成
    const toCreateMap: (
      | {
          info: vrchatLogService.WorldJoinLogInfo;
          yearMonthPath: string;
          fileName: string;
          content: Buffer;
        }
      | Error
      | null
    )[] = await Promise.all(
      worldJoinLogInfoList.value.map(async (info) => {
        const contentImage = await generateOGPImageBuffer({
          worldName: info.worldName,
          date: info.date,
          imageWidth: props.imageWidth,
        });
        if (contentImage.isErr()) {
          return contentImage.error;
        }
        return {
          info,
          yearMonthPath: genYearMonthPath(props.vrchatPhotoDir, info),
          fileName: genfileName(info),
          content: contentImage.value,
        };
      }),
    );
    // error がある場合はエラーを返す
    const error_list = toCreateMap.filter(
      (map) => map instanceof Error,
    ) as Error[];
    if (error_list.length > 0) {
      for (const error of error_list) {
        log.error('error', error);
      }
      return neverthrow.err(error_list[0]);
    }
    const filteredMap = toCreateMap.filter((map) => map !== null) as Exclude<
      (typeof toCreateMap)[number],
      null | Error
    >[];
    return neverthrow.ok(filteredMap);
  };

const CreateFilesError = [
  'FAILED_TO_CREATE_YEAR_MONTH_DIR',
  'FAILED_TO_CREATE_FILE',
  'FAILED_TO_CHECK_YEAR_MONTH_DIR_EXISTS',
  'FAILED_TO_GET_TO_CREATE_MAP',
] as const;
interface CreateFilesProps {
  vrchatPhotoDir: string;
  removeAdjacentDuplicateWorldEntriesFlag: boolean;
}
const createFiles =
  (settingStore: ReturnType<typeof getSettingStore>) =>
  async ({
    vrchatPhotoDir,
    removeAdjacentDuplicateWorldEntriesFlag,
  }: CreateFilesProps): Promise<
    neverthrow.Result<
      { createdFilesLength: number },
      { error: Error; type: (typeof CreateFilesError)[number] }
    >
  > => {
    const toCreateMapResult = await getToCreateMap(settingStore)({
      vrchatPhotoDir: vrchatPhotoDir,
      removeAdjacentDuplicateWorldEntriesFlag:
        removeAdjacentDuplicateWorldEntriesFlag,
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
    const yearMonthPathSet = new Set(
      toCreateMap.map((map) => map.yearMonthPath),
    );
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

    return neverthrow.ok({ createdFilesLength: toCreateMap.length });
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
  } | null;
  tookPhotoList: {
    photoPath: string;
    tookDatetime: Date;
  }[];
}[] => {
  const sortedWorldJoinInfoList = [...worldJoinInfoList].sort((a, b) => {
    return datefns.compareAsc(a.joinDatetime, b.joinDatetime);
  });

  const groupedPhotoList: {
    photoPath: string;
    tookDatetime: Date;
  }[][] = [];

  const results = sortedWorldJoinInfoList.map((world, index) => {
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

    // 使った写真を記録しておく
    groupedPhotoList.push(
      vrcPhotoList.filter((photo) => tookPhotoList.includes(photo)),
    );

    return {
      world,
      tookPhotoList,
    } as {
      world: {
        worldId: `wrld_${string}`;
        worldName: string;
        joinDatetime: Date;
      } | null;
      tookPhotoList: {
        photoPath: string;
        tookDatetime: Date;
      }[];
    };
  });

  // 残った写真を記録しておく
  const remainingPhotoList = vrcPhotoList.filter(
    (photo) => !groupedPhotoList.flat().includes(photo),
  );
  if (remainingPhotoList.length > 0) {
    results.push({
      world: null,
      tookPhotoList: remainingPhotoList,
    });
  }

  return results;
};

const getConfigAndValidateAndCreateFiles =
  (settingStore: ReturnType<typeof getSettingStore>) =>
  async (): Promise<
    neverthrow.Result<{ createdFilesLength: number }, string>
  > => {
    // ファイルを作成する場所になる vrchat photo のディレクトリを取得
    const vrchatPhotoDir = vrchatPhotoService.getVRChatPhotoDir({
      storedPath: settingStore.getVRChatPhotoDir(),
    });
    if (vrchatPhotoDir.error !== null) {
      return neverthrow.err(vrchatPhotoDir.error);
    }
    // join情報を記録するファイルを作成
    const result = await createFiles(settingStore)({
      vrchatPhotoDir: vrchatPhotoDir.path,
      removeAdjacentDuplicateWorldEntriesFlag:
        settingStore.getRemoveAdjacentDuplicateWorldEntriesFlag() ?? false,
    });
    return result
      .map((r) => {
        return r;
      })
      .mapErr((error) => {
        return `${error.type}: ${error.error}`;
      });
  };

export {
  getToCreateWorldJoinLogInfos,
  groupingPhotoListByWorldJoinInfo,
  getConfigAndValidateAndCreateFiles,
};
