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
      return player state is playing
    end tell
  else
    return false
  end if
end IsPlaying

on GetCurrentTrack()
  if IsPlaying() then
    tell application "iTunes"
      if not (exists current track) then
        return "再生中の曲を取得できません"
      end if
      set trackTitle to (name of current track)
      set trackArtist to (artist of current track)
			set aLyrics to (lyrics of current track)
      tell LyricsToArray
        set trackLyrics to SetLyricsToArray(aLyrics)
      end tell
      return "{\"title\":\"" & trackTitle & "\",\"artist\":\"" & trackArtist & "\",\"lyrics\":" & trackLyrics & "}"
    end tell
  else
    return "曲を再生してください"
  end if
end GetCurrentTrack

on run argv
  set command to item 1 of argv
  if command is "currenttrack" then
    return GetCurrentTrack()
  else
    return "{\"error\":\"Unsupported command\"}"
  end if
end run