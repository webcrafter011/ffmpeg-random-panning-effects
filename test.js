const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const INPUT_FOLDER = "input"; // Folder containing images
const OUTPUT_VIDEO = "final_output.mp4"; // Final output video
const TEMP_VIDEO = "temp_output.mp4"; // Temporary file to hold the final video
const DURATION_PER_IMAGE = 4; // Duration per image (seconds)
const FRAME_RATE = 30; // FPS
const RESOLUTION = "1920x1080"; // Video resolution
const TEMP_CLIP = "output_single.mp4"; // Temporary video for each image

const DIRECTIONS = [
  "left-to-right",
  "right-to-left",
  "top-to-bottom",
  "bottom-to-top",
];

const processImage = (inputFile) => {
  return new Promise((resolve, reject) => {
    const direction = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
    const totalFrames = DURATION_PER_IMAGE * FRAME_RATE;

    let zoompanFilter = "";
    switch (direction) {
      case "left-to-right":
        zoompanFilter = `zoompan=z=1.2:x='(iw-iw/1.2)*on/${totalFrames}':y=0:d=1:s=${RESOLUTION}`;
        break;
      case "right-to-left":
        zoompanFilter = `zoompan=z=1.2:x='(iw-iw/1.2)*(1-on/${totalFrames})':y=0:d=1:s=${RESOLUTION}`;
        break;
      case "top-to-bottom":
        zoompanFilter = `zoompan=z=1.2:x=0:y='(ih-ih/1.2)*on/${totalFrames}':d=1:s=${RESOLUTION}`;
        break;
      case "bottom-to-top":
        zoompanFilter = `zoompan=z=1.2:x=0:y='(ih-ih/1.2)*(1-on/${totalFrames})':d=1:s=${RESOLUTION}`;
        break;
    }

    console.log(`🎥 Processing ${inputFile} with ${direction} effect...`);

    const ffmpeg = spawn("ffmpeg", [
      "-loop",
      "1",
      "-framerate",
      FRAME_RATE.toString(),
      "-t",
      DURATION_PER_IMAGE.toString(),
      "-i",
      inputFile,
      "-vf",
      zoompanFilter,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-y",
      TEMP_CLIP,
    ]);

    ffmpeg.stderr.on("data", (data) => process.stdout.write(data.toString()));

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        if (fs.existsSync(TEMP_CLIP)) {
          console.log(`✅ Created video for ${inputFile}`);
          mergeWithExistingVideo(TEMP_CLIP).then(resolve).catch(reject);
        } else {
          reject(
            new Error(`FFmpeg finished but ${TEMP_CLIP} was not created.`)
          );
        }
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });
  });
};

const mergeWithExistingVideo = (newClip) => {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(newClip)) {
      reject(new Error(`Merge failed: ${newClip} does not exist.`));
      return;
    }

    if (!fs.existsSync(TEMP_VIDEO)) {
      fs.renameSync(newClip, TEMP_VIDEO);
      resolve();
      return;
    }

    console.log("🔗 Merging with existing video...");

    const tempMergedVideo = "temp_merged.mp4";
    const ffmpeg = spawn("ffmpeg", [
      "-i",
      TEMP_VIDEO,
      "-i",
      newClip,
      "-filter_complex",
      "[0:v:0][1:v:0]concat=n=2:v=1[outv]",
      "-map",
      "[outv]",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-y",
      tempMergedVideo,
    ]);

    ffmpeg.stderr.on("data", (data) => process.stdout.write(data.toString()));

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        fs.renameSync(tempMergedVideo, TEMP_VIDEO);
        fs.unlinkSync(newClip);
        resolve();
      } else {
        reject(new Error(`FFmpeg merge failed with code ${code}`));
      }
    });
  });
};

const watchAndProcessImages = async () => {
  try {
    console.log("📂 Watching folder for images...");
    const files = fs.readdirSync(INPUT_FOLDER);

    for (const file of files) {
      if (file.match(/\.(jpg|jpeg|png)$/i)) {
        const filePath = path.join(INPUT_FOLDER, file);
        await processImage(filePath);
      }
    }

    console.log("🎬 Finalizing video...");
    fs.renameSync(TEMP_VIDEO, OUTPUT_VIDEO);
    console.log(`✅ Final video created: ${OUTPUT_VIDEO}`);
  } catch (error) {
    console.error("❌ Error:", error);
  }
};

watchAndProcessImages();
