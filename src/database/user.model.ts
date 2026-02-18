import mongoose, {Document, Schema} from 'mongoose';

export interface UserDocument extends Document {
    email: string;
    passwordHash: string;
    targetInvestmentPercent: number;
}

const UserSchema = new Schema<UserDocument>(
    {
        email: {type: String, required: true, unique: true},
        passwordHash: {type: String, required: true},
        targetInvestmentPercent: {type: Number, default: 30}
    },
    {timestamps: true}
);

export default mongoose.model<UserDocument>('User', UserSchema);