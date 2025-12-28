const pendingRequests = new Map();

function dedupeRequest(cacheKey, createRequest) {
  if (pendingRequests.has(cacheKey)) {
    const pendingResolvers = pendingRequests.get(cacheKey);
    return new Promise((resolve) => {
      pendingResolvers.push(resolve);
    });
  }

  return new Promise((resolve) => {
    const resolvers = [resolve];
    pendingRequests.set(cacheKey, resolvers);

    createRequest()
      .then((result) => {
        resolvers.forEach((resolver) => resolver(result));
      })
      .catch((error) => {
        resolvers.forEach((resolver) => resolver(error));
      })
      .finally(() => {
        pendingRequests.delete(cacheKey);
      });
  });
}

export { dedupeRequest };
