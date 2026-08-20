export function parseEpoch(str: string): number {
  if (str && /^\d+$/.test(str)) {
    return parseInt(str, 10);
  }
  return 0;
}

export interface EpochConflictHandlers {
  localEpoch: string;
  onWipe: (newEpoch: string) => void | Promise<void>;
  onSendCorrective: (localEpoch: string) => void;
}

/**
 * Shared conflict resolution for both the `epoch_reset` and `request_sync`
 * message handlers (previously duplicated verbatim in each — see
 * SYNC_REFACTOR_PLAN.md achado #2). Returns true when a conflict was found
 * and handled — callers should skip their normal message processing then.
 */
export async function resolveEpochConflict(
  remoteEpochStr: string | undefined,
  { localEpoch, onWipe, onSendCorrective }: EpochConflictHandlers,
): Promise<boolean> {
  if (!remoteEpochStr || remoteEpochStr === localEpoch) return false;

  const remoteEpoch = parseEpoch(remoteEpochStr);
  const localEpochNum = parseEpoch(localEpoch);

  if (remoteEpoch > localEpochNum) {
    console.log(
      `🔄 [Sync] Received newer remote epoch ${remoteEpochStr}. Wiping and resyncing...`,
    );
    await onWipe(remoteEpochStr);
  } else {
    console.log(
      `🔄 [Sync] Received older/equal remote epoch ${remoteEpochStr}. Sending corrective reset...`,
    );
    onSendCorrective(localEpoch);
  }
  return true;
}
