import * as neverthrow from 'neverthrow';
import { match } from 'ts-pattern';
import type { getSettingStore } from '../../../module/settingStore';
import { getService } from '../../service';
import VRChatLogFileError from '../../service/vrchatLog/error';
import * as vrchatLogService from '../../service/vrchatLog/vrchatLog';
import type VRChatPhotoFileError from '../../vrchatPhoto/error';

/**
 * VRC log から WorldJoinLogInfo[] を取得する
 */
export const getWorldJoinLogInfos =
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
    const preprocessedWorldJoinLogInfoList =
      vrchatLogService.convertLogLinesToWorldJoinLogInfos(logLinesResult.value);

    console.log(
      'preprocessedWorldJoinLogInfoList',
      preprocessedWorldJoinLogInfoList.length,
    );

    return neverthrow.ok(preprocessedWorldJoinLogInfoList);
  };
