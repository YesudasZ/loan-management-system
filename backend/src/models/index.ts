import { UserModel } from './user.model.js';

const ALL_MODELS = [UserModel];

/**
 * Creates every collection and builds its indexes (for example the unique email index)
 * before the app serves requests. Rejects if an index can't be built, so startup fails loudly
 * instead of running without a uniqueness guarantee.
 */
export async function initModels(): Promise<void> {
  await Promise.all(ALL_MODELS.map((model) => model.init()));
}
