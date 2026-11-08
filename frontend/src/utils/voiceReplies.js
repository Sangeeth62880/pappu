import { queryClient } from '../data/queryClient';
import { queryKeys } from '../data/queryKeys';
import { fetchProfile } from '../api/client';

/**
 * Whether Pappu should speak a reply on its own (Me → Voice replies).
 *
 * Reads the profile cached by Home and Me. When it is not cached yet, fetches it once
 * without caching (no retry, so a failure never holds up the reply). A missing value or a
 * failed lookup speaks, matching the profile default (voice_replies is true by default).
 * This gates only automatic playback; tapping a message's speaker button always plays.
 *
 * @param {string} token Supabase access token
 * @returns {Promise<boolean>}
 */
export async function voiceRepliesEnabled(token) {
  try {
    let profile = queryClient.getQueryData(queryKeys.profile());
    if (profile === undefined) {
      profile = await fetchProfile(token);
    }
    return profile?.voice_replies !== false;
  } catch (_e) {
    return true;
  }
}
