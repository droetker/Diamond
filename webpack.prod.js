const path = require('path');

module.exports = {
  entry: './src/index.js',
  mode: 'production',
  output: {
    filename: 'main.js',
    path: path.resolve(__dirname, 'dist'),
    publicPath: '/ConfTest/dist/',
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