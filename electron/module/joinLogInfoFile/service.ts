import path from 'node:path';
import * as datefns from 'date-fns';
import * as neverthrow from 'neverthrow';
import type { getSettingStore } from '../../module/settingStore';
import * as fs from '../lib/wrappedFs';
import type VRChatLogFileError from '../service/vrchatLog/error';
import type * as vrchatLogService from '../service/vrchatLog/vrchatLog';
import type VRChatPhotoFileError from '../vrchatPhoto/error';
import * as vrchatPhotoService from '../vrchatPhoto/service';

import * as worldJoinLogInfoService from './service/worldJoinLogInfo';
import * as worldJoinLogInfoFileService from './service/worldJoinLogInfoFile';

const getRemoveAdjacentDuplicateWorldEntriesFlag = (
  settingStore: ReturnType<typeof getSettingStore>,
) => {
  return settingStore.getRemoveAdjacentDuplicateWorldEntriesFlag() ?? false;
};

const getWorldJoinLogInfoListToPreview =
  (settingStore: ReturnType<typeof getSettingStore>) =>
  async (props: {
    vrchatPhotoDir: string;
  }): Promise<
    neverthrow.Result<
      vrchatLogService.WorldJoinLogInfo[],
      VRChatLogFileError | VRChatPhotoFileError
    >
  > => {
    const worldJoinLogInfoList =
      await worldJoinLogInfoService.getWorldJoinLogInfos(settingStore)();
    if (worldJoinLogInfoList.isErr()) {
      return neverthrow.err(worldJoinLogInfoList.error);
    }

    const toPreviewWorldJoinLogInfos =
      worldJoinLogInfoFileService.filterToCreateWorldJoinLogInfoList({
        worldJoinLogInfoList: worldJoinLogInfoList.value,
        removeAdjacentDuplicateWorldEntriesFlag:
          getRemoveAdjacentDuplicateWorldEntriesFlag(settingStore),
        vrchatPhotoDir: props.vrchatPhotoDir,
      });

    return neverthrow.ok(toPreviewWorldJoinLogInfos);
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
    const toCreateMapResult = await worldJoinLogInfoFileService.getToCreateMap(
      settingStore,
    )({
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

const groupingPhotoListToPreviewByWorldJoinInfo = (
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
      };
      tookPhotoList: {
        photoPath: string;
        tookDatetime: Date;
      }[];
    };
  });

  // 残った写真を記録しておく
  // new join list の preview には必要ないのでコメントアウト
  // const remainingPhotoList = vrcPhotoList.filter(
  //   (photo) => !groupedPhotoList.flat().includes(photo),
  // );
  // if (remainingPhotoList.length > 0) {
  //   results.push({
  //     world: null,
  //     tookPhotoList: remainingPhotoList,
  //   });
  // }

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
    if (vrchatPhotoDir.isErr()) {
      return neverthrow.err(vrchatPhotoDir.error.error);
    }
    // join情報を記録するファイルを作成
    const result = await createFiles(settingStore)({
      vrchatPhotoDir: vrchatPhotoDir.value.path,
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
  groupingPhotoListToPreviewByWorldJoinInfo,
  getConfigAndValidateAndCreateFiles,
  getWorldJoinLogInfoListToPreview,
};
