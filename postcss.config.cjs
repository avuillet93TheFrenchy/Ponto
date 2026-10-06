const plugins = [
  require('autoprefixer')(),
];

const isVitest = Boolean(process.env.VITEST);

if (!isVitest) {
  plugins.push(
    require('cssnano')({
      preset: 'default',
    })
  );
}

module.exports = { plugins };
