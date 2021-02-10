self.addEventListener('message', (message) => {
  const buffer = message.data;
  let binaryData = '';
  for (let i = 0; i < buffer.length; i++) {
    binaryData += String.fromCharCode(buffer[i]);
  }
  self.postMessage(binaryData);
});