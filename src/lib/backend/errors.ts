/** Converts expected application and database failures into messages and HTTP status codes used by the API. */
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = 'request_failed',
  ) {
    super(message);
  }
}
export function databaseError(error: { message: string; code?: string } | null) {
  if (!error) return;
  if (error.code === '42501')
    throw new AppError('You do not have permission to perform this action.', 403, 'forbidden');
  if (error.code === '23505')
    throw new AppError('This record or transfer reference already exists.', 409, 'duplicate');
  if (error.code === 'PGRST202' || error.code === '42P01')
    throw new AppError(
      'Apply the ASCEND database migrations before using this feature.',
      503,
      'setup_required',
    );
  throw new AppError(error.message, 400);
}
