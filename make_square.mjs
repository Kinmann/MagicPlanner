import { Jimp } from "jimp";

async function makeSquare() {
    console.log("Reading logo.png...");
    const image = await Jimp.read("logo.png");
    const width = image.bitmap.width;
    const height = image.bitmap.height;
    
    console.log(`Original size: ${width}x${height}`);
    
    if (width === height) {
        console.log("Already square. Saving as logo_square.png");
        await image.write("logo_square.png");
        return;
    }
    
    const size = Math.max(width, height);
    
    // Transparent background
    const background = new Jimp({ width: size, height: size, color: 0x00000000 });
    
    const x = Math.floor((size - width) / 2);
    const y = Math.floor((size - height) / 2);
    
    background.composite(image, x, y);
    
    await background.write("logo_square.png");
    console.log(`Saved logo_square.png with size ${size}x${size}`);
}

makeSquare().catch(err => {
    console.error("Error making square image:", err);
    process.exit(1);
});
