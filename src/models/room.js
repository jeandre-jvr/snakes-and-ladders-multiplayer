import mongoose from "mongoose";
const Schema = mongoose.Schema;

const roomSchema = new Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },
    active: {
        type: Boolean,
        required: true
    },
    scoreboard: {
        type: Map,
        of: Number,
        default: {},
    }
}, { timestamps: true });

export default mongoose.model('Room', roomSchema);