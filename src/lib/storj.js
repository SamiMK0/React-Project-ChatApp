import { S3Client, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand } from "@aws-sdk/client-s3";


// Storj S3 Gateway Configuration
const STORJ_CLIENT = new S3Client({
    region: "us-east-1",
    endpoint: import.meta.env.VITE_STORJ_ENDPOINT,
    credentials: {
        accessKeyId: import.meta.env.VITE_STORJ_ACCESS_KEY_ID,
        secretAccessKey: import.meta.env.VITE_STORJ_SECRET_ACCESS_KEY,
    },
});

const fileToBuffer = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsArrayBuffer(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = (error) => reject(error);
    });
};

const uploadToStorj = async (file) => {
    if (!file) return null;

    const fileName = `${Date.now()}-${file.name}`;
    const fileBuffer = await fileToBuffer(file);
    
    try {
        // Initiate the multipart upload
        console.log("Initiating multipart upload...");
        const initiateParams = {
            Bucket: import.meta.env.VITE_STORJ_BUCKET_NAME,
            Key: fileName,
        };
        const { UploadId } = await STORJ_CLIENT.send(new CreateMultipartUploadCommand(initiateParams));
        console.log('Multipart upload initiated, UploadId:', UploadId);

        const partSize = 5 * 1024 * 1024; // 5MB parts
        const partCount = Math.ceil(file.size / partSize);
        const uploadPromises = [];

        // Upload parts
        for (let partNumber = 1; partNumber <= partCount; partNumber++) {
            const startByte = (partNumber - 1) * partSize;
            const endByte = Math.min(startByte + partSize, file.size);
            const partBuffer = fileBuffer.slice(startByte, endByte);

            console.log(`Uploading part ${partNumber}...`);

            const uploadPartParams = {
                Bucket: import.meta.env.VITE_STORJ_BUCKET_NAME,
                Key: fileName,
                PartNumber: partNumber,
                UploadId,
                Body: partBuffer,
            };

            const uploadPartPromise = STORJ_CLIENT.send(new UploadPartCommand(uploadPartParams));
            uploadPromises.push(uploadPartPromise);
        }

        // Wait for all parts to upload
        const partResults = await Promise.all(uploadPromises);
        console.log('All parts uploaded:', partResults);

        // Complete the multipart upload
        const completeParams = {
            Bucket: import.meta.env.VITE_STORJ_BUCKET_NAME,
            Key: fileName,
            UploadId,
            MultipartUpload: {
                Parts: partResults.map((result, index) => ({
                    ETag: result.ETag,
                    PartNumber: index + 1,
                })),
            },
        };

        await STORJ_CLIENT.send(new CompleteMultipartUploadCommand(completeParams));
        console.log("Multipart upload completed!");

        // Return the URL of the uploaded file
        return `${import.meta.env.VITE_STORJ_ENDPOINT}/${import.meta.env.VITE_STORJ_BUCKET_NAME}/${fileName}`;
    } catch (error) {
        console.error("Storj Upload Error:", error);
        throw new Error("Upload failed!");
    }
};



export default uploadToStorj;
