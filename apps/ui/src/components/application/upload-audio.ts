// XMLHttpRequest exposes real upload progress and shares the form's abort signal.
export function uploadAudio(file: File, signal: AbortSignal, onProgress: (percent: number) => void): Promise<Response> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const xhr = new XMLHttpRequest();
    const abort = () => { xhr.abort(); reject(signal.reason); };
    xhr.open("POST", "/api/tracks/uploads");
    xhr.upload.onprogress = event => {
      if (event.lengthComputable && !signal.aborted) onProgress(Math.min(100, Math.floor(event.loaded / event.total * 100)));
    };
    xhr.onload = () => resolve(new Response(xhr.responseText, { status: xhr.status }));
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.onabort = () => reject(new DOMException("Upload aborted", "AbortError"));
    xhr.onloadend = () => signal.removeEventListener("abort", abort);
    signal.addEventListener("abort", abort, { once: true });
    const body = new FormData();
    body.append("file", file);
    xhr.send(body);
  });
}
