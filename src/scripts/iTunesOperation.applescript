on IsRunning()
	tell application "System Events"
		set iTunesIsRunning to exists (processes where name is "iTunes")
	end tell

	return iTunesIsRunning
end IsRunning

on IsPlaying()
  if IsRunning() then
    tell application "iTunes"
      return player state is not stopped
    end tell
  else
    return false
  end if
end IsPlaying

on GetPlayingPosition()
  if IsPlaying() then
    tell application "iTunes"
      if not (exists current track) then
        return "再生中の曲を取得できません"
      end if
      set trackTitle to (name of current track)
      set trackArtist to (artist of current track)
      set trackTime to (time of current track)
      set trackPosition to (player position as real)
    end tell

    return "{\"title\":\"" & trackTitle & "\",\"artist\":\"" & trackArtist & "\",\"time\":\"" & trackTime & "\",\"position\":" & trackPosition & "}"
  else
    return "曲を再生してください"
  end if
end GetPlayingPosition

on GetTrackLyrics()
  if IsPlaying() then
    tell application "iTunes"
			set aLyrics to (lyrics of current track)
    end tell

    tell application "Finder"
      set ScriptPath to parent of (path to me) as text
    end tell
    set LyricsToArray to load script file (ScriptPath & "LyricsToArray.scpt")
    tell LyricsToArray
      set trackLyrics to SetLyricsToArray(aLyrics)
    end tell
    return trackLyrics
  else
    return "曲を再生してください"
  end if
end GetLyrics

on RepositionToBeginning()
  tell application "iTunes"
    back track
    play
  end tell
end RepositionToBeginning

on JumpPlayPosition(position)
  if IsPlaying() then
    set aPosition to (position as number)
    tell application "iTunes"
      set player position to aPosition
    end tell
  end if
end JumpPlayPosition

on run argv
  set command to item 1 of argv
  if command is "playing" then
    return GetPlayingPosition()
  else if command is "lyrics" then
    return GetTrackLyrics()
  else if command is "back" then
    return RepositionToBeginning()
  else if command is "jump" then
    set position to item 2 of argv
		JumpPlayPosition(position)
  else
    return "{\"error\":\"Unsupported command\"}"
  end if
end run