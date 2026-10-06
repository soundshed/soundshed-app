const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const NodePolyfillPlugin = require("node-polyfill-webpack-plugin")
const { ProvidePlugin } = require('webpack');
var path = require('path');

module.exports = {
	watch: false,
	target: 'electron-renderer',
	mode: 'production', // development
	//devtool: 'inline-source-map', //remove for prod
	entry: {
		app: './build/components/app.js',
	},
	output: {
		path: path.resolve(__dirname, 'build'),
		filename: '[name].bundle.js'
	},
	resolve: {
		// Add `.ts` and `.tsx` as a resolvable extension.
		extensions: [".ts", ".tsx", ".js", ".jsx"]
	},
	module: {
		rules: [
			{
				test: /\.css$/i,
				use: ['style-loader', 'css-loader'],
			},
			{
				test: /\.(woff(2)?|ttf|eot|svg)(\?v=\d+\.\d+\.\d+)?$/,
				type: 'asset/resource'
			 },
			 {
				test: /\.(png|jpe?g|gif)$/i,
				type: 'asset/resource'
			 }
		]
	},
	plugins: [
		new NodePolyfillPlugin({ excludeAliases: ['Buffer'] }),
		new ProvidePlugin({ Buffer: [require.resolve('buffer/'), 'Buffer'] }),
		new HtmlWebpackPlugin({
			template: './index.html'
		}),
		new CopyPlugin({
			patterns: [
				{ from: './css', to: 'css' },
				{ from: './lib', to: 'lib' },
				{ from: './images', to: 'images' }
			]
		})
	]
};