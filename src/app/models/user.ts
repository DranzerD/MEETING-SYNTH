import { Schema, model, models } from "mongoose";

const UserSchema = new Schema({
  name: { type: String },
  email: { type: String, unique: true },
  phone_number: { type: String },
  password: { type: String }, // plain password (no hashing)
  role: { type: String },
  team_id: { type: String },
  reports_to: { type: Schema.Types.ObjectId, ref: "User", default: null },
});

const User = models.User || model("User", UserSchema);
export default User;
