export default async function globalTeardown() {
  // Get server reference from global scope
  const proxyServer = global.__playwright_test_server__;

  if (proxyServer) {
    await new Promise((resolve) => proxyServer.close(resolve));
    delete global.__playwright_test_server__;
    console.log("✅ Mock proxy server stopped");
  }
}

