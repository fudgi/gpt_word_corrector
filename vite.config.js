import { defineConfig } from "vite";
import { resolve } from "path";
import { readdirSync, statSync } from "fs";
import {
  getProxyEndpoint,
  copyStaticFiles,
  copyCssFiles,
  copyFileWithProcessing,
} from "./vite-utils.js";

// Plugin to copy static files and CSS files
function copyStaticFilesPlugin() {
  const proxyEndpoint = getProxyEndpoint();

  return {
    name: "copy-static-files",
    buildStart() {
      // Watch static files for changes
      const staticDir = resolve(__dirname, "static");
      if (statSync(staticDir, { throwIfNoEntry: false })) {
        readdirSync(staticDir).forEach((file) => {
          const filePath = resolve(staticDir, file);
          this.addWatchFile(filePath);
        });
      }
    },
    handleHotUpdate({ file, server }) {
      // Handle changes to static files
      if (file.includes("/static/")) {
        const staticDir = resolve(__dirname, "static");
        const outDir = resolve(__dirname, "corrector");
        const destPath = resolve(outDir, file.replace(staticDir + "/", ""));

        try {
          copyFileWithProcessing(file, destPath, proxyEndpoint, staticDir);
        } catch (e) {
          const relativePath = file.replace(staticDir + "/", "");
          console.error(`❌ Failed to copy ${relativePath}:`, e);
        }

        // Trigger a rebuild
        server.ws.send({
          type: "full-reload",
        });
      }
    },
    writeBundle() {
      const staticDir = resolve(__dirname, "static");
      const srcDir = resolve(__dirname, "src");
      const outDir = resolve(__dirname, "corrector");

      copyStaticFiles(staticDir, outDir, proxyEndpoint);
      copyCssFiles(srcDir, outDir);
    },
  };
}

export default defineConfig({
  build: {
    outDir: "corrector",
    emptyOutDir: true, // Clean the directory on each build
    rollupOptions: {
      input: {
        content: resolve(__dirname, "src/content.js"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name].[ext]",
      },
    },
    minify: false, // Keep readable for debugging
    sourcemap: false,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  plugins: [copyStaticFilesPlugin()],
});
