const MAX_SIDE = 1600;

// Shrinks a camera photo to at most 1600 px on its longest side as JPEG,
// returning base64 for the api plus a preview URL.
export async function preparePhoto(file) {
  if (!file.type.startsWith("image/")) throw new Error("Choose a photo.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return { type: "image/jpeg", base64: dataUrl.split(",")[1], previewUrl: dataUrl };
}
