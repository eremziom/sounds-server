import { Controller, Get, Post, Body, Patch, Param, ParseIntPipe, Delete} from '@nestjs/common'
import type { Track } from './tracks.service'
import { TracksService } from './tracks.service'
import { CreateTrackDto } from './create-track.dto'
import { UpdateTrackDto } from './update-track.dto'

@Controller('tracks')
export class TracksController {
  constructor(private readonly tracksService: TracksService) {}

  @Get()
  /**
   * Returns an array of all tracks.
   * @returns {Track[]} An array of all tracks.
   */
  findAll(): Track[] {
    return this.tracksService.findAll()
  }
  @Post()
  /**
   * Creates a new track and returns it.
   * @param {CreateTrackDto} createTrackDto The track data to be created.
   * @returns {Track} The newly created track.
   */
  create(
    @Body() createTrackDto: CreateTrackDto): Track {
    return this.tracksService.create(createTrackDto)
  }
  @Patch(':id')
  /**
   * Updates a track by id and returns the updated track.
   * @param {number} id The id of the track to be updated.
   * @param {UpdateTrackDto} updateTrackDto The track data to be updated.
   * @returns {Track} The updated track.
   */
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateTrackDto: UpdateTrackDto): Track {
    return this.tracksService.update(id, updateTrackDto)
  }
  @Delete(':id')
  /**
   * Deletes a track by id.
   * @param {number} id The id of the track to be deleted.
   */
  remove(@Param('id', ParseIntPipe) id: number): void {
    this.tracksService.remove(id)
  }
}
