// Dummy fsevents implementation for Raycast build
module.exports = {
  watch: () => ({ stop: () => {} }),
  getInfo: () => ({})
};