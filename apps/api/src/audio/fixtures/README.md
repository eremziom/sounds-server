The two MP3 fixtures are synthetic 440 Hz sine waves (0.3 seconds), generated
locally with FFmpeg 8.0/libmp3lame. They contain no third-party recordings.
`tone.mp3` is stereo MPEG-1 Layer III, 44.1 kHz, 128 kbit/s.
`tone-mpeg25.mp3` is mono MPEG-2.5 Layer III, 8 kHz, variable bitrate.
No FFmpeg executable is needed to run the tests or the API.

Generation commands (from the repository root):

```powershell
ffmpeg -v error -f lavfi -i 'sine=frequency=440:sample_rate=44100:duration=0.3' -ac 2 -c:a libmp3lame -b:a 128k -write_xing 0 -id3v2_version 0 -map_metadata -1 -y apps/api/src/audio/fixtures/tone.mp3
ffmpeg -v error -f lavfi -i 'sine=frequency=440:sample_rate=8000:duration=0.3' -ac 1 -c:a libmp3lame -q:a 6 -write_xing 0 -id3v2_version 0 -map_metadata -1 -y apps/api/src/audio/fixtures/tone-mpeg25.mp3
```
