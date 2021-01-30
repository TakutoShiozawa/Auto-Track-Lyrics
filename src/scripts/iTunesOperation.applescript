property LyricsToArray: load script POSIX file "/Users/shiozawatakuto/Desktop/開発/auto_scroll_lyrics/src/scripts/LyricsToArray.scpt"

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
      return "{\"title\":\"" & trackTitle & "\",\"artist\":\"" & trackArtist & "\",\"time\":\"" & trackTime & "\",\"position\":" & trackPosition & "}"
    end tell
  else
    return "曲を再生してください"
  end if
end GetPlayingPosition

on GetTrackLyrics()
  if IsPlaying() then
    tell application "iTunes"
			set aLyrics to (lyrics of current track)
      tell LyricsToArray
        set trackLyrics to SetLyricsToArray(aLyrics)
      end tell
    end tell
    return trackLyrics
  else
    return "曲を再生してください"
  end if
end GetLyrics

on run argv
  set command to item 1 of argv
  if command is "playing" then
    return GetPlayingPosition()
  else if command is "lyrics" then
    return GetTrackLyrics()
  else
    return "{\"error\":\"Unsupported command\"}"
  end if
end run