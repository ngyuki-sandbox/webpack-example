const ManifestPlugin = require('webpack-manifest-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');

const ejs = require('ejs');

module.exports = (env, argv) => {
    const production = argv.mode === 'production';
    const manifest = production && env && env.manifest ? require('./dist/manifest.json') : {}

    return {
        mode: argv.mode || 'development',
        context: `${__dirname}/src`,
        entry: {
            index: './index.ejs',
            app: './app.js',
            style: './style.scss',
        },
        output: {
            path: `${__dirname}/dist`,
            filename: production ? '[name].[contenthash].js' : '[name].js',
            publicPath: '/'
        },
        plugins: [
            new ManifestPlugin({ basePath: '/' }),
            new CleanWebpackPlugin({
                protectWebpackAssets: false,
                cleanAfterEveryBuildPatterns: [
                    'index.*.js',
                    'style.*.js',
                ],
            }),
            new MiniCssExtractPlugin({
                filename: production ? '[name].[contenthash].css' : '[name].css'
            }),
        ],
        module: {
            rules: [
                {
                    test: /\.ejs$/,
                    use: [
                        { loader: 'file-loader', options: { name: '[name].html' }},
                        { loader: 'extract-loader' },
                        {
                            loader: 'html-loader',
                            options: {
                                attributes: false,
                                preprocessor: (content, loader) => {
                                    try {
                                        const asset = (f) => manifest[f] || f;
                                        return ejs.render(content, { asset }, {
                                            filename: loader.resourcePath,
                                            includer: (_, parsedPath) => {
                                                loader.addDependency(parsedPath);
                                            },
                                        });
                                    } catch (err) {
                                        loader.emitError(err);
                                        return content;
                                    }
                                },
                            },
                        },
                    ],
                },
                {
                    test: /\.scss$/,
                    use: [
                        { loader: MiniCssExtractPlugin.loader },
                        { loader: 'css-loader' },
                        { loader: 'sass-loader' },
                    ],
                },
            ],
        },
        devtool: 'source-map',
    };
}