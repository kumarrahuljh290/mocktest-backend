import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

export const uploadFile = async (file, folder="quiz") => {
    try{
        const result = await cloudinary.uploader.upload(file,{
            folder,
            resource_type:"auto"
        });
        return {
            url: result.secure_url,
            publicId: result.public_id
        };
    }
    catch(error){
        throw new Error("FILE_UPLOAD_FAILED");
    }
};


export const deleteUploadedFile = async (publicId) => {
    if(!publicId)
        return;
    try{
        await cloudinary.uploader.destroy(publicId);
        return true;
    }
    catch(error){
        throw new Error("FILE_DELETE_FAILED");
    }

};