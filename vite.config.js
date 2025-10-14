import { defineConfig } from "vite";
import { resolve } from "path";
import { copyFileSync, mkdirSync, readdirSync, statSync } from "fs";

// Plugin to copy static files
function copyStaticFiles() {
  return {
    name: "copy-static-files",
    writeBundle() {
      const staticDir = resolve(__dirname, "static");
      const outDir = resolve(__dirname, "corrector");

      function copyRecursive(src, dest) {
        const stats = statSync(src);
        if (stats.isDirectory()) {
          if (!statSync(dest, { throwIfNoEntry: false })) {
            mkdirSync(dest, { recursive: true });
          }
          readdirSync(src).forEach((file) => {
            copyRecursive(resolve(src, file), resolve(dest, file));
          });
        } else {
          copyFileSync(src, dest);
        }
      }

      if (statSync(staticDir, { throwIfNoEntry: false })) {
        readdirSync(staticDir).forEach((file) => {
          copyRecursive(resolve(staticDir, file), resolve(outDir, file));
        });
        console.log("✅ Static files copied");
      }
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
  plugins: [copyStaticFiles()],
});
