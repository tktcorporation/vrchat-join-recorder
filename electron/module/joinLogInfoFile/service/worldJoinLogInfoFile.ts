import path from 'node:path';
import * as datefns from 'date-fns';
import * as log from 'electron-log';
import * as neverthrow from 'neverthrow';
import type { getSettingStore } from '../../../module/settingStore';
import * as fs from '../../lib/wrappedFs';
import * as vrchatLogService from '../../service/vrchatLog/vrchatLog';
import { generateOGPImageBuffer } from './createWorldNameImage';

const genYearMonthPath = (
  vrchatPhotoDir: string,
  info: vrchatLogService.WorldJoinLogInfo,
) => {
  return path.join(vrchatPhotoDir, datefns.format(info.date, 'yyyy-MM'));
};
const genfileName = (info: vrchatLogService.WorldJoinLogInfo) => {
  return `${vrchatLogService.convertWorldJoinLogInfoToOneLine(info)}.jpeg`;
};

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

export const filterToCreateWorldJoinLogInfoList = (props: {
  vrchatPhotoDir: string;
  worldJoinLogInfoList: vrchatLogService.WorldJoinLogInfo[];
  removeAdjacentDuplicateWorldEntriesFlag: boolean;
}): vrchatLogService.WorldJoinLogInfo[] => {
  let preprocessedWorldJoinLogInfoList = props.worldJoinLogInfoList;

  // TODO: 重複削除のオプション作成
  // removeAdjacentDuplicateWorldEntriesFlag が true の場合は隣接する重複を削除
  if (props.removeAdjacentDuplicateWorldEntriesFlag) {
    preprocessedWorldJoinLogInfoList = removeAdjacentDuplicateWorldEntries(
      preprocessedWorldJoinLogInfoList,
    );
  }

  // ログから抽出した作成できるファイルの情報から、すでに存在するファイルを除外
  preprocessedWorldJoinLogInfoList = preprocessedWorldJoinLogInfoList.filter(
    (info) => {
      const infoPath = path.join(
        genYearMonthPath(props.vrchatPhotoDir, info),
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

  return preprocessedWorldJoinLogInfoList;
};

const getRemoveAdjacentDuplicateWorldEntriesFlag = (
  settingStore: ReturnType<typeof getSettingStore>,
) => {
  return settingStore.getRemoveAdjacentDuplicateWorldEntriesFlag() ?? false;
};

import * as worldJoinLogInfoService from './worldJoinLogInfo';

/**
 * WorldJoinLogInfoFile を作成するためのデータを取得する
 */
export const getToCreateMap =
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
      await worldJoinLogInfoService.getWorldJoinLogInfos(settingStore)();
    if (worldJoinLogInfoList.isErr()) {
      return neverthrow.err(worldJoinLogInfoList.error);
    }

    const toCreateWorldJoinLogInfos = filterToCreateWorldJoinLogInfoList({
      worldJoinLogInfoList: worldJoinLogInfoList.value,
      removeAdjacentDuplicateWorldEntriesFlag:
        getRemoveAdjacentDuplicateWorldEntriesFlag(settingStore),
      vrchatPhotoDir: props.vrchatPhotoDir,
    });

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
      toCreateWorldJoinLogInfos.map(async (info) => {
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
