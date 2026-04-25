
const path = require("path");
const webpack = require("webpack");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const { WebpackManifestPlugin } = require("webpack-manifest-plugin");
const BundleAnalyzerPlugin = require("webpack-bundle-analyzer").BundleAnalyzerPlugin;
const CompressionPlugin = require("compression-webpack-plugin"); // For Gzip compression
const MiniCssExtractPlugin = require("mini-css-extract-plugin"); // For extracting CSS in production
const TerserPlugin = require('terser-webpack-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');

module.exports = (env, argv) => {
  const isProduction = argv.mode === "production";
  const isDevelopment = argv.mode === "development";
  console.log("isProduction: ", isProduction);

  return {
    cache: {
      type: "filesystem", // <--- ADD THIS
    },
    watchOptions: {
      ignored: /node_modules|static/,
    },
    mode: isProduction ? "production" : "development",
    devtool: isProduction ? "source-map" : "eval-cheap-module-source-map", // <--- CHANGE THIS
    //devtool: isProduction ? "source-map" : "eval-source-map", // Often change devtool for prod
    // Your existing config entries: entry, output, module, resolve, etc.
    mode: argv.mode, // Set the mode for Webpack itself
    entry: {
      page1: "./src/index.tsx",
      // ...
    },
    output: {
      path: path.resolve(__dirname, "static"),
      filename: isProduction ? "[name]_[contenthash].js" : "[name].js",
      chunkFilename: isProduction ? "[name]_[contenthash].js" : "[name].js",
      clean: true,
      publicPath: "/static/",
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          exclude: /node_modules/,
          use: {
            // Replace 'ts-loader' with this
            loader: "swc-loader",
            options: {
              // SWC options can be left empty to use defaults
              // Or configure them in a .swcrc file
              jsc: {
                parser: {
                  syntax: "typescript",
                  tsx: true,
                },
                transform: {
                  react: {
                    runtime: "automatic", // Use the new JSX transform
                  },
                },
              },
            },
          },
        },
        {
          test: /\.css$/i,
          use: [isProduction ? MiniCssExtractPlugin.loader : "style-loader", "css-loader", "postcss-loader"],
        },
        {
          test: /\.(png|svg|jpg|jpeg|gif)$/i,
          type: "asset/resource",
          generator: {
            filename: "images/[name]_[hash][ext]",
          },
        },
        {
          test: /\.(woff|woff2|eot|ttf|otf)$/i,
          type: "asset/resource",
          generator: {
            filename: "fonts/[name]_[hash][ext]",
          },
        },
      ],
    },
    resolve: {
      extensions: [".tsx", ".ts", ".js", ".jsx"],
      alias: {
        "@src": path.resolve(__dirname, "src/"),
      },
    },
   optimization: {
       sideEffects: true, // Defaults to true in production mode, good to be explicit
       usedExports: true, // Enables tree shaking
       runtimeChunk: "single", // Creates a single runtime file to be shared for all generated chunks.
       moduleIds: "deterministic", // Hashes module ids for better long-term caching
       chunkIds: "deterministic", // Hashes chunk ids for better long-term caching
       splitChunks: {
         chunks: "all", // Optimize initial, async, and all chunks
         minSize: 20000,
         minRemainingSize: 0,
         minChunks: 1,
         maxAsyncRequests: 30,
         maxInitialRequests: 30,
         enforceSizeThreshold: 50000,
         cacheGroups: {
           // Create a separate chunk for large, foundational libraries
           reactVendor: {
             test: /[\\/]node_modules[\\/](react|react-dom|react-router-dom)[\\/]/,
             name: "vendor-react",
             chunks: "all",
             priority: 10, // Higher priority to be processed first
           },
           // All other node_modules
           defaultVendors: {
             test: /[\\/]node_modules[\\/]/,
             priority: -10,
             reuseExistingChunk: true,
           },
           default: {
             minChunks: 2,
             priority: -20,
             reuseExistingChunk: true,
           },
         },
       },
       minimizer: [
         new TerserPlugin({
           terserOptions: {
             compress: {
               drop_console: true, // Optionally remove console.logs in production
             },
           },
           extractComments: false, // Prevents creation of a separate license file
         }),
         new CssMinimizerPlugin(),
       ],
     },
 
     // stats: {
     //   children: true,
     //   colors: true,
     //   modules: true,
     //   reasons: true,
     //   errorDetails: true
     // },
     plugins: [
       //new BundleAnalyzerPlugin(), // Uncomment to use the analyzer
       //isProduction &&
      //  isProduction &&
      //    new MiniCssExtractPlugin({
      //      filename: "[name]_[contenthash].css",
      //    }),
       isProduction &&
         new CompressionPlugin({
           // Add Gzip compression for production
           algorithm: "gzip",
           test: /\.(js|css|html|svg)$/,
           threshold: 10240, // Only compress assets bigger than 10kb
           minRatio: 0.8, // Only compress if the compression ratio is better than 0.8
         }),
       isProduction &&
         new MiniCssExtractPlugin({
           filename: "[name]_[contenthash].css",
           chunkFilename: "[id]_[contenthash].css",
           ignoreOrder: true, // <--- Add this line
         }),
 
       new WebpackManifestPlugin({
         fileName: "manifest.json",
         generate: (seed, files, entrypoints) => {
           const manifestFiles = files.reduce((manifest, file) => {
             manifest[file.name] = file.path;
             return manifest;
           }, seed);
 
           const entrypointFiles = {};
           for (const entrypoint in entrypoints) {
             let jsFiles = entrypoints[entrypoint].filter((fileName) => fileName.endsWith(".js"));
             let cssFiles = entrypoints[entrypoint].filter((fileName) => fileName.endsWith(".css"));
             for (let jsFile in jsFiles) {
               jsFiles[jsFile] = "/static/" + jsFiles[jsFile]; // Add 'static/' prefix and remove leading './' from paths
             }
             for (let cssFile in cssFiles) {
               cssFiles[cssFile] = "/static/" + cssFiles[cssFile]; // Add 'static/' prefix and remove leading './' from paths
             }
 
             entrypointFiles[entrypoint] = {
               assets: {
                 js: jsFiles,
                 css: cssFiles,
               },
             };
           }
 
           return {
             files: manifestFiles,
             entrypoints: entrypointFiles,
           };
         },
       }),
     ].filter(Boolean),
   };
 };
 