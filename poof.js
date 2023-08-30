const frameRate = 10;
const chromaKeyMin = 244;

const broadcast = document.getElementById('broadcast');
const message = document.getElementById('message');

// draw a chroma key alpha frame from video onto canvas using buffer
function chromaFrame(video, buffer, buffer2d, canvas, canvas2d) {
  const { videoWidth: width, videoHeight: height } = video;
  buffer.width = canvas.width = width;
  buffer.height = canvas.height = height;
  buffer2d.drawImage(video, 0, 0, width, height);
  const frame = buffer2d.getImageData(0, 0, width, height);
  for (let ii = 0; ii < frame.data.length / 4; ii++) {
    const rr = frame.data[ii*4 + 0]
    const gg = frame.data[ii*4 + 1];
    const bb = frame.data[ii*4 + 2];
    if (rr > chromaKeyMin && gg > chromaKeyMin && bb > chromaKeyMin) {
      frame.data[ii*4 + 3] = 0;
    }
  }
  canvas2d.putImageData(frame, 0, 0);
}

// set up a callback invoked when an element is removed from its parent
function onRemoved(elt, cb) {
  const mo = new MutationObserver((mrs) => {
    for (const mr of mrs) {
      for (const removed of mr.removedNodes) {
        if (removed === elt) {
          mo.disconnect();
          return cb();
        }
      }
    }
  });
  mo.observe(elt.parentElement, { childList: true });
}

// add an item
async function start(stream) {
  const div = document.createElement('div');
  const video = document.createElement('video');
  div.appendChild(video);
  
  video.autoplay = true;
  video.muted = true;
  video.srcObject = stream;
  
  div.style.left = document.querySelectorAll('video').length * 10 + '%';
  div.style.top = '0';
  div.style.height = '100%';
  
  div.addEventListener('mousedown', (event) => {
    const { clientX: initX } = event;
    const { offsetLeft: initLeft } = div;
    function move(event) {
      // drag: reposition
      event.preventDefault();
      const left = (event.clientX - initX + initLeft) / document.body.offsetWidth;
      div.style.left = Math.min(90, Math.max(-20, Math.round(left * 100))) + '%';
    }
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', () => {
      document.removeEventListener('mousemove', move);
    }, { once: true });
  });
  video.addEventListener('click', (event) => {
    if (event.metaKey) {
      // command-click: switch to chroma key alpha
      video.style.position = 'absolute';
      video.style.visibility = 'hidden';
      const buffer = document.createElement('canvas');
      const buffer2d = buffer.getContext('2d');
      const canvas = document.createElement('canvas');
      const canvas2d = canvas.getContext('2d');
      div.appendChild(canvas);
      const timer = setInterval(() => {
        chromaFrame(video, buffer, buffer2d, canvas, canvas2d);
      }, 1000 / frameRate);
      onRemoved(video, () => clearInterval(timer));
      // command-click: toggle chroma key alpha
      canvas.addEventListener('click', (event) => {
        if (event.metaKey) { div.replaceChild(buffer, canvas); }
      });
      buffer.addEventListener('click', (event) => {
        if (event.metaKey) { div.replaceChild(canvas, buffer); }
      });
    }
  });
  div.addEventListener('dblclick', (event) => {
    if (event.shiftKey) {
      // shift-double-click: send to back
      broadcast.insertBefore(div, broadcast.querySelector('div'));
    } else {
      // double-click: bring to front
      broadcast.appendChild(div);
    }
  });
  div.addEventListener('contextmenu', (event) => event.preventDefault());
  
  broadcast.appendChild(div);
  
  const title = ` [${stream.getVideoTracks()[0].label}]`;
  document.title += title;
  
  onRemoved(video, () => {
    stream.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
    document.title = document.title.replace(title, '');
  });
}

// add a screen share
async function addScreen() {
  start(await navigator.mediaDevices.getDisplayMedia({
    audio: false,
    video: { width: 1512, height: 1024, frameRate },
  }));
}

// add a video camera
async function addCamera() {
  const media = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: true,
  });
  const devices = await navigator.mediaDevices.enumerateDevices();
  const cameras = devices.filter((dev) => dev.kind === 'videoinput');
  if (cameras.length > 1) {
    media.getTracks().forEach((track) => track.stop());
    message.textContent = cameras.map(({ label }, idx) => `${idx+1}) ${label.replace(/ Camera$/, '')}`).join('\n');
    document.addEventListener('keyup', async (event) => {
      event.stopImmediatePropagation();
      message.textContent = '';
      if (event.code.startsWith('Digit')) {
        const camera = cameras[parseInt(event.key) - 1];
        start(await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { deviceId: camera.deviceId },
        }));
      }
    }, { once: true });
  } else {
    start(media);
  }
}

// remove all items
function removeAll() {
  broadcast.querySelectorAll('video').forEach((video) => video.remove());
  broadcast.querySelectorAll('div').forEach((div) => div.remove());
}

// listen for key commands
function main() {
  let state = '';
  window.addEventListener('keyup', (event) => {
    if (state === '' && event.key === '+') {
      state = message.textContent = '+';
    } else if (state === '+' && event.key === 's') {
      state = message.textContent = '';
      // +, s: add screen share
      addScreen();
    } else if (state === '+' && event.key === 'c') {
      state = message.textContent = '';
      // +, c: add video camera
      addCamera();
    } else if (state === '' && event.key === '-') {
      state = message.textContent = '-';
    } else if (state === '' && event.key === '0') {
      state = '0';
      message.innerHTML = '&empty;';
    } else if (state === '0' && event.key === '0') {
      state = message.textContent = '';
      // 0, 0: remove all
      removeAll();
    } else if (state === '' &&  event.code.startsWith('Digit')) {
      // 1 -- 9: bring to front
      const divs = [ ...broadcast.children ].sort((a, b) => {
        return parseInt(a.style.left) - parseInt(b.style.left);
      });
      broadcast.appendChild(divs[parseInt(event.key) - 1]);
    } else if (event.key === 'Escape') {
      state = message.textContent = '';
    }
  });
  document.addEventListener('click', (event) => {
    if (state === '-') {
      state = message.textContent = '';
      // -, click: remove item
      if (event.target.matches('video, canvas')) {
        event.target.parentElement.remove();
        event.target.parentElement.querySelector('video').remove();
      }
    }
  });
}

main();
