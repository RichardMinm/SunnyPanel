export const createAsyncSingleton = <T>(
  initialize: () => Promise<T>,
) => {
  let pending: Promise<T> | null = null;

  return () => {
    if (!pending) {
      pending = initialize().catch((error) => {
        pending = null;
        throw error;
      });
    }

    return pending;
  };
};
