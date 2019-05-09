# Webpack v5 で ejs->html や scss->css をやるメモ

- https://webpack.js.org/

## CSS with file-loader

```js
module.exports = {
    mode: 'development',
    context: `${__dirname}/src`,
    entry: {
        app: './app.js',
        style: './style.scss',
    },
    output: {
        path: `${__dirname}/dist`,
        publicPath: '/',
    },
    module: {
        rules: [
            {
                test: /\.scss$/,
                use: [
                    { loader: 'file-loader', options: { name: '[path][name].css' }},
                    { loader: 'extract-loader' },
                    { loader: 'css-loader' },
                    { loader: 'sass-loader' },
                ],
            },
        ]
    },
    devtool: 'source-map',
};
```

style.scss をエントリーファイルにしているため style.js も作成される。CleanWebpackPlugin を使えばそのようないらないファイルを自動で削除できる。

```js
const { CleanWebpackPlugin } = require('clean-webpack-plugin');

module.exports = {
    // ...snip...
    plugins: [
        new CleanWebpackPlugin({
            protectWebpackAssets: false,
            cleanAfterEveryBuildPatterns: ['style.js', 'style.js.map'],
        }),
    ],
};
```

ソースマップが `devtool: 'source-map'` などを指定していたてもインラインに出力される。sass-loader でソースマップが生成された後に css-loader -> extract-loader でインラインにされているもよう。

css-loader -> extract-loader 通さずに sass-loader -> file-loader としたり、sass-loader -> css-loader -> extract-loader -> source-map-loader -> file-loader のようにすれば大丈夫かと思ったけど、やっぱりダメ。

file-loader でローダーに渡された sourceMap（第２引数）が emitFile に渡されないのでダメっぽい。

- https://github.com/webpack-contrib/file-loader/blob/c423008dce1b16e1253b89b792f03774ffeb47de/src/index.js#L81

次のような簡易なローダーを用意して sass-loader の直後に配置すれば大丈夫そうではある（css-loader -> extract-loader -> source-map-loader を通すとソースマップは作成されるものの上手く適用されない）。

```js
const loaderUtils = require("loader-utils");
module.exports = function (content, sourceMap) {
    const filename = loaderUtils.interpolateName(this, '[name].css', { context: this.context });
    this.emitFile(filename, content, sourceMap);
    return `module.exports = {}`;
};
```

また、この方法だと HMR を使用できない。

## CSS with MiniCssExtractPlugin

```js
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = {
    mode: 'development',
    context: `${__dirname}/src`,
    entry: {
        app: './app.js',
        style: './style.scss',
    },
    output: {
        path: `${__dirname}/dist`,
    },
    plugins: [
        new MiniCssExtractPlugin({ filename: '[name].css' }),
    ],
    module: {
        rules: [
            {
                test: /\.scss$/,
                use: [
                    { loader: MiniCssExtractPlugin.loader },
                    { loader: 'css-loader' },
                    { loader: 'sass-loader' },
                ],
            },
        ]
    },
    devtool: 'source-map',
};
```

file-loader を使う方法とは異なり、ソースマップもうまく作成される。

style.scss がエントリーファイルになっているので style.js も作成される。通常これは空の何もしないモジュールだけど、HMR が有効なときは HMR のためのコードがどばっと出力されるため、HMR するためには style.js を HTML で読み込む必要がある。

MiniCssExtractPlugin はエントリーファイルごとに、インポートされたすべての css を一つにまとめたファイルを作成するものなので、`[name]` などのプレースホルダはエントリーファイルのファイル名が基準となる。なので js で `import './style/scss'` などとすると `app.css` が作成される。

## HTML with file-loader

```js
module.exports = {
    mode: 'development',
    context: `${__dirname}/src`,
    entry: {
        index: './index.html',
        app: './app.js',
    },
    output: {
        path: `${__dirname}/dist`,
    },
    module: {
        rules: [
            {
                test: /\.html$/,
                use: [
                    { loader: 'file-loader', options: { name: '[name].[ext]' }},
                ],
            },
        ]
    },
};
```

extract-loader と html-loader を用いれば HTML 内の script や link から js や css の解決もできる。

```js
module.exports = {
    mode: 'development',
    context: `${__dirname}/src`,
    entry: {
        index: './index.html',
    },
    output: {
        path: `${__dirname}/dist`,
    },
    module: {
        rules: [
            {
                test: /\.html$/,
                use: [
                    { loader: 'file-loader', options: { name: '[path][name].[ext]' }},
                    { loader: 'extract-loader' },
                    { loader: 'html-loader' },
                ],
            },
        ]
    },
};
```

がしかし、script タグで読み込む js で import が使われていると次のようなエラーになる。

```
./src/app.js:1
(function (exports, require, module, __filename, __dirname) { import hoge from './hoge.js'
                                                              ^^^^^^
SyntaxError: Cannot use import statement outside a module
```

どうやら下記のあたりでエラーになっているもよう。

- https://github.com/peerigon/extract-loader/blob/85008407e266ef7d7513d10a68ae9d03bddff7b8/src/extractLoader.js#L143

次のように webpack.config.js ではなく html で直接ローダーを指定すれば大丈夫っぽい・・ただ出力された js で import が解決されず元の js ファイルそのままになってしまう。

```html
<script src="file-loader?name=[name].[contenthash].js!./app.js"></script>
```

js の import の解決は loader がすべて処理された後の段階で webpack によって処理されるため file-loader の段階ではまだ解決されていない、ということなのだと思う。

HTML をエントリにして script タグを解決させるのは難しそう・・

- [Use a HTML file as an entry point? · Issue \#536 · webpack/webpack](https://github.com/webpack/webpack/issues/536)

## HTML with HtmlWebpackPlugin

```js
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
    mode: 'development',
    context: `${__dirname}/src`,
    entry: {
        app: './app.js',
    },
    output: {
        path: `${__dirname}/dist`,
    },
    plugins: [
        new HtmlWebpackPlugin({ filename: 'index.html', template: 'index.html' }),
    ],
    module: {
        rules: [
            {
                test: /\.html$/,
                use: [
                    { loader: 'html-loader', options: { attributes: false }},
                ],
            },
        ]
    },
};
```

index.html は HtmlWebpackPlugin によって書き出されるのでエントリーには不要。

HtmlWebpackPlugin が HTML に script タグや link タグを自動的に挿入する。なのでテンプレートの HTML にそれらをベタに書いておく必要は無い。デフォルトではすべてのエントリーの js や css が挿入される。HtmlWebpackPlugin のコンストラクタの chunks オプションで挿入するエントリーの指定も可能。

`inject: false` を指定すると、js や css の挿入は行われなくなる。

なお、webpack を watch で実行しているとき、HtmlWebpackPlugin による HTML ファイルの生成は任意のいずれかのファイルを修正したときに常に再実行される。`inject: false` や `chunks:[]` などを指定して script や link の自動挿入を行わないようにしていたとしても同様。`htmlWebpackPlugin.tags.headTags` などを用いてテンプレートの HTML に埋め込むこともできるため、HTML が依存するファイルを簡単には決められず、任意のすべてのファイルに依存する、みたいになっているからだと思われる。

## EJS with ejs

```js
const ejs = require('ejs');

module.exports = {
    mode: 'development',
    context: `${__dirname}/src`,
    entry: {
        index: './index.ejs',
        app: './app.js',
    },
    output: {
        path: `${__dirname}/dist`,
    },
    module: {
        rules: [
            {
                test: /\.ejs$/,
                use: [
                    { loader: 'file-loader', options: { name: '[path][name].html' }},
                    { loader: 'extract-loader' },
                    {
                        loader: 'html-loader',
                        options: {
                            attributes: false,
                            preprocessor: (content, loader) => {
                                try {
                                    return ejs.render(content, {}, {
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
        ]
    },
};
```

include したファイルを webpack で補足して watch 出来るようにするために ejs の includer オプションを使う必要があります。

また、この例は extract-loader -> file-loader を使わずに HtmlWebpackPlugin を使うようにしても OK です。

## EJS with ejs-compiled-loader

```js
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
    mode: 'development',
    context: `${__dirname}/src`,
    entry: {
        app: './app.js',
    },
    output: {
        path: `${__dirname}/dist`,
    },
    plugins: [
        new HtmlWebpackPlugin({ filename: 'index.html', template: 'index.ejs' }),
    ],
    module: {
        rules: [
            {
                test: /\.ejs$/,
                use: [
                    { loader: 'ejs-compiled-loader', options: {}},
                ],
            },
        ]
    },
};
```

ejs-compiled-loader は出力がコンパイルされたテンプレートの関数になるので、そのまま extract-loader しただけだと HTML にはならず、extract-loader と file-loader の組み合わせでは使用できない。

HtmlWebpackPlugin とあわせて利用すると大丈夫。

ejs のオプションで `client: true` が指定されるため include 関数は使用できず include ディレクティブを使う必要がある。また、include したファイルは webpack で補足されないため watch されない。

include ではなく require で次のように読み込めば watch される。

```js
<%- require('./header.ejs')() %>
```

## EJS with ejs-html-loader

```js
module.exports = {
    mode: 'development',
    context: `${__dirname}/src`,
    entry: {
        index: './index.ejs',
        app: './app.js',
    },
    output: {
        path: `${__dirname}/dist`,
    },
    module: {
        rules: [
            {
                test: /\.ejs$/,
                use: [
                    { loader: 'file-loader', options: { name: '[path][name].html' }},
                    { loader: 'ejs-html-loader' },
                ],
            },
        ]
    },
};
```

ejs の 2 系が必要。include 関数と include ディレクティブの両方が使用可能。ただし include 関数だと webpack が watch してくれない。include ディレクティブなら大丈夫。

## contenthash

html-loader で script や link を解決させれば js や css のパスに contenthash を含めることができるが、前述の通り script タグで動作しない。

HtmlWebpackPlugin で自動的に js や css を挿入させる場合はファイル名に contenthash を含めることもできるが、複数の HTML があって読み込む js や css がそれぞれ異なるときに設定がとてもめんどくさくなる。

```js
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
    mode: 'development',
    context: `${__dirname}/src`,
    entry: {
        app1: './app1.js',
        app2: './app2.js',
        style1: './style1.scss',
        style2: './style2.scss',
    },
    output: {
        path: `${__dirname}/dist`,
        filename: '[name].[contenthash].js',
    },
    plugins: [
        new MiniCssExtractPlugin({ filename: '[name].[contenthash].css' }),
        new HtmlWebpackPlugin({ filename: 'index1.html', template: 'index1.html', chunks: ['style1', 'app1'],}),
        new HtmlWebpackPlugin({ filename: 'index2.html', template: 'index2.html', chunks: ['style2', 'app2'],}),
    ],
    module: {
        rules: [
            {
                test: /\.html$/,
                use: [
                    { loader: 'html-loader' },
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
};
```

プロダクション用にビルドするときだけの問題なので [webpack-manifest-plugin](https://www.npmjs.com/package/webpack-manifest-plugin) とか [Stats Data \| webpack](https://webpack.js.org/api/stats/) とかでアセットのファイル名の対応の JSON を出力し、ejs でアセットのファイル名を返す関数を使うとかでも良いかもしれない。

```js
// 対応表を読み込み
const stats = (() => {
    const url = require('url');
    const stats = require('./stats.json');
    return Object.fromEntries(
        Object.values(stats.assetsByChunkName).flat().map(v => {
            return [stats.publicPath + url.parse(v).pathname, stats.publicPath + v];
        })
    );
})();

// ejs に asset 関数を渡す
const asset = (f) => stats[f] || f;
return ejs.render(content, { asset }, {
    filename: loader.resourcePath,
    includer: (_, parsedPath) => { loader.addDependency(parsedPath) },
});

// ejs テンプレートで asset 関数を使う
<script src="<%= asset('/app.js') %>"></script>
```
