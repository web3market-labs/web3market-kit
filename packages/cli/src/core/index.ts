export { type ProgressReporter, AuthError } from './types.js'
export { validateAuth } from './auth.js'
export {
  type TrackedProject,
  listProjects,
  findProject,
  registerProject,
  touchProject,
  removeProject,
} from './project-store.js'
export { type DetectedProject, detectProject } from './project-detector.js'
export { autoTrackProject } from './project-tracker.js'
