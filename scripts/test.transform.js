export function process(src, filename, config, options) {
  console.log('RUNNING');
  return 'const goog = { define(name, value) { return value; } };' + src;
}

export default {
  process,
};
