const path = require('path');

module.exports = {
  entry: './src/index.js',
  mode: 'development',
  output: {
    filename: 'main.js',
    path: path.resolve(__dirname, 'dist'),
    publicPath: '/dist/',
  },
  devServer: {
    client: {
      overlay: false,
    },
    static: {
        directory: path.join(__dirname, '/')
    }
  },
};