const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const INPUT_FOLDER = "input";
const OUTPUT_VIDEO = "final_output.mp4";
const TEMP_FOLDER = "temp";
const DURATION_PER_IMAGE = 4;
const FRAME_RATE = 30;
const RESOLUTION = "1920x1080";

const DIRECTIONS = [
  "left-to-right",
  "right-to-left",
  "top-to-bottom",
  "bottom-to-top",
];

// Create temp folder if not exists
if (!fs.existsSync(TEMP_FOLDER)) {
  fs.mkdirSync(TEMP_FOLDER);
}

// Remove progress bar setup and variables
let totalProgress = 0;
let currentFileIndex = 0;
let totalFiles = 0;

const processImage = (inputFile, index, totalImages) => {
  return new Promise((resolve, reject) => {
    const direction = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
    const clipFile = path.join(TEMP_FOLDER, `clip_${index}.mp4`);
    const imageFrames = DURATION_PER_IMAGE * FRAME_RATE;

    let zoompanFilter = "";
    switch (direction) {
      case "left-to-right":
        zoompanFilter = `zoompan=z=1.2:x='(iw-iw/1.2)*on/${imageFrames}':y=0:d=1:s=${RESOLUTION}`;
        break;
      case "right-to-left":
        zoompanFilter = `zoompan=z=1.2:x='(iw-iw/1.2)*(1-on/${imageFrames})':y=0:d=1:s=${RESOLUTION}`;
        break;
      case "top-to-bottom":
        zoompanFilter = `zoompan=z=1.2:x=0:y='(ih-ih/1.2)*on/${imageFrames}':d=1:s=${RESOLUTION}`;
        break;
      case "bottom-to-top":
        zoompanFilter = `zoompan=z=1.2:x=0:y='(ih-ih/1.2)*(1-on/${imageFrames})':d=1:s=${RESOLUTION}`;
        break;
    }

    console.log(`🎥 Processing image ${index + 1}/${totalImages}...`);

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
      clipFile,
    ]);

    ffmpeg.stderr.on("data", (data) => {
      const output = data.toString();
      const match = output.match(/frame=\s*(\d+)/);
      if (match) {
        const currentFrames = parseInt(match[1], 10);
        const fileProgress = (currentFrames / imageFrames) * 100;
        // Calculate overall progress considering both current file and previous files
        const overallProgress = Math.floor((currentFileIndex * 100 + fileProgress) / totalFiles);
        console.log(`Progress: ${overallProgress}%`);
      }
    });

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        currentFileIndex++;
        resolve(clipFile);
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });
  });
};

const mergeVideos = async () => {
  try {
    console.log("\n🔗 Merging all generated videos...");

    const videoFiles = fs
      .readdirSync(TEMP_FOLDER)
      .filter((file) => file.endsWith(".mp4"))
      .map((file) => `file '${path.resolve(TEMP_FOLDER, file)}'`)
      .join("\n");

    if (!videoFiles) {
      throw new Error("No videos found in temp folder for merging.");
    }

    const listFilePath = path.join(TEMP_FOLDER, "file_list.txt");
    fs.writeFileSync(listFilePath, videoFiles);

    const ffmpeg = spawn("ffmpeg", [
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listFilePath,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-y",
      OUTPUT_VIDEO,
    ]);

    return new Promise((resolve, reject) => {
      ffmpeg.stderr.on("data", (data) => {
        const output = data.toString();
        const match = output.match(/time=(\d{2}):(\d{2}):(\d{2}.\d{2})/);
        if (match) {
          const [_, hours, minutes, seconds] = match;
          const totalSeconds = (+hours) * 3600 + (+minutes) * 60 + (+seconds);
          const totalDuration = totalFiles * DURATION_PER_IMAGE;
          const mergeProgress = Math.floor((totalSeconds / totalDuration) * 100);
          console.log(`Merging Progress: ${mergeProgress}%`);
        }
      });

      ffmpeg.on("close", (code) => {
        if (code === 0) {
          console.log(`✅ Final video created: ${OUTPUT_VIDEO}`);
          resolve();
        } else {
          reject(new Error(`FFmpeg merge failed with code ${code}`));
        }
      });
    });
  } catch (error) {
    console.error("❌ Error merging videos:", error);
  }
};

const watchAndProcessImages = async () => {
  try {
    console.log("📂 Scanning folder for images...");
    const files = fs
      .readdirSync(INPUT_FOLDER)
      .filter((file) => file.match(/\.(jpg|jpeg|png)$/i));

    if (files.length === 0) {
      console.log("⚠️ No images found in input folder.");
      return;
    }

    totalFiles = files.length;
    currentFileIndex = 0;

    for (let i = 0; i < files.length; i++) {
      const filePath = path.join(INPUT_FOLDER, files[i]);
      await processImage(filePath, i, files.length);
    }

    await mergeVideos();

    // Cleanup temp folder
    fs.readdirSync(TEMP_FOLDER).forEach((file) =>
      fs.unlinkSync(path.join(TEMP_FOLDER, file))
    );
    fs.rmdirSync(TEMP_FOLDER);
  } catch (error) {
    console.error("❌ Error:", error);
  }
};

watchAndProcessImages();
