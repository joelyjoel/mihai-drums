if(!window.MediaRecorder)
  window.MediaRecorder = require('audio-recorder-polyfill');



(function() {

	var promisifiedOldGUM = function(constraints, successCallback, errorCallback) {
    console.log("## call to promisifiedGUM")

		// First get ahold of getUserMedia, if present
		var getUserMedia = (navigator.getUserMedia ||
				navigator.webkitGetUserMedia ||
				navigator.mozGetUserMedia ||
				navigator.msGetUserMedia);

		// Some browsers just don't implement it - return a rejected promise with an error
		// to keep a consistent interface
		if(!getUserMedia) {
			return Promise.reject(new Error('getUserMedia is not implemented in this browser'));
		}

		// Otherwise, wrap the call to the old navigator.getUserMedia with a Promise
		return new Promise(function(successCallback, errorCallback) {
			getUserMedia.call(navigator, constraints, successCallback, errorCallback);
		});
		
	}

	// Older browsers might not implement mediaDevices at all, so we set an empty object first
	if(navigator.mediaDevices === undefined) {
		navigator.mediaDevices = {};
	}

	// Some browsers partially implement mediaDevices. We can't just assign an object
	// with getUserMedia as it would overwrite existing properties.
	// Here, we will just add the getUserMedia property if it's missing.
	if(navigator.mediaDevices.getUserMedia === undefined) {
		navigator.mediaDevices.getUserMedia = promisifiedOldGUM;
  }
  
  // This is a bit of a hack
  if(!window.navigator.getUserMedia)
    window.navigator.getUserMedia = (...args) => window.navigator.mediaDevices.getUserMedia(...args);
	
})();

export default window.MediaRecorder
