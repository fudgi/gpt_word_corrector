import { defineConfig } from "vite";
import { resolve } from "path";
import { copyFileSync, mkdirSync, readdirSync, statSync } from "fs";

// Plugin to copy static files and CSS files
function copyStaticFiles() {
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
        const relativePath = file.replace(staticDir + "/", "");
        const destPath = resolve(outDir, relativePath);

        try {
          copyFileSync(file, destPath);
          console.log(`✅ Updated static file: ${relativePath}`);
        } catch (e) {
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

      // Copy static files
      if (statSync(staticDir, { throwIfNoEntry: false })) {
        readdirSync(staticDir).forEach((file) => {
          copyRecursive(resolve(staticDir, file), resolve(outDir, file));
        });
        console.log("✅ Static files copied");
      }

      // Copy CSS files from src to src directory in output
      const srcOutDir = resolve(outDir, "src");
      if (!statSync(srcOutDir, { throwIfNoEntry: false })) {
        mkdirSync(srcOutDir, { recursive: true });
      }

      if (statSync(srcDir, { throwIfNoEntry: false })) {
        readdirSync(srcDir).forEach((file) => {
          if (file.endsWith(".css")) {
            copyFileSync(resolve(srcDir, file), resolve(srcOutDir, file));
            console.log(`✅ Copied CSS file: ${file}`);
          }
        });
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
