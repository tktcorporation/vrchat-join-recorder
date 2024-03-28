import * as datefns from 'date-fns';

import type * as vrchatLogService from '../service/vrchatLog/vrchatLog';

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

export { removeAdjacentDuplicateWorldEntries };
