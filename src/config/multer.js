import multer from "multer";
import path from "path";

const storage = multer.diskStorage({

    destination:(req,file,cb)=>{
        cb(null,"uploads/");
    },

    filename:(req,file,cb)=>{
        const unique = Date.now()+"-"+Math.random();
        cb(null,unique+path.extname(file.originalname));
    }

});

export const upload = multer({
    storage,
    limits:{ fileSize:2*1024*1024 }
});