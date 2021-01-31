on FindTimeTable(trackTitle, trackArtist)
  tell application "Finder"
    set fileName to trackTitle & " - " & trackArtist & ".txt"
		set fPath to "Macintosh HD:Users:shiozawatakuto:Library:iTunes:Auto Scroll Lyrics:"
    set filePath to fPath & fileName
    set textData to ""
    set existing to exists filePath
    if existing is equal to true then
      try
        set theFile to open for access file filePath
        set textdata to read theFile
      on error
      end try
      close access file filePath
      if not (textData is equal to "") then
        set ScriptPath to parent of (path to me) as text
        set LyricsToArray to load script file (ScriptPath & "LyricsToArray.scpt")
        tell LyricsToArray
          set textData to SetLyricsToArray(textData)
        end tell
      end if
    else
      return "??????????????"
    end if
    return textData
  end tell
end FindTimeTable

on run argv
  set trackTitle to item 1 of argv
  set trackArtist to item 2 of argv
  return FindTimeTable(trackTitle, trackArtist)
end run