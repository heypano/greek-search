## greekSearch method

Επιστρέφει εαν το `text` περιέχει το `match` ασχέτως τόνων και τελικών ς.

Returns whether `text` contains `match` independent of stresses and final ς.

`greekSearch(text, match[, caseSensitive])`


## Parameters

- `text` 
  - The source string to search 
- `match`
  - The text to look for
- `caseSensitive`
  - Whether the search should be case sensitive (defaults to `false`)

## Sample Usage

    import { greekSearch } from "@heypano/greek-search";
    
    let input, match, output;

    // Case sensitive Search
    input = "Κάποιος ΆλλοΣ";
    match = "ΑλλοΣ";
    output = greekSearch(input, match); // true

    match = "άλλος";
    output = greekSearch(input, match); // false


    // Case inensitive Search

    match = "άλλος";
    output = greekSearch(input, match, false); // true
