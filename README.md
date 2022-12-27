![All Downloads](https://img.shields.io/github/downloads/jessev14/pf2e-staves/total?style=for-the-badge)

![Latest Release Download Count](https://img.shields.io/github/downloads/jessev14/pf2e-staves/latest/module.zip)
[![Forge Installs](https://img.shields.io/badge/dynamic/json?label=Forge%20Installs&query=package.installs&suffix=%25&url=https%3A%2F%2Fforge-vtt.com%2Fapi%2Fbazaar%2Fpackage%2Fpf2e-staves&colorB=4aa94a)](https://forge-vtt.com/bazaar#package=pf2e-staves)

This module was funded by a commission. Donations help fund updates and new modules!

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/jessev14)

# PF2e Staves
 
This FoundryVTT module implements automations for Staves in the PF2e game system.

## Usage

When an item with the "magical" and "staff" traits are added to a character sheet, a corresponding spellcasting entry will be created.

[]

Any spells linked in the text description will be automatically added to the spellcasting entry. This works for custom spells, as long as the spell exists in the item directory.

[]

This spellcasting entry uses charges. The number of charges defaults to the highest level spell slot the character has. Casting spells in this spellcasting entry will requires charges equal the level of the spell. If the character has Spontaneous spellcasting, the charge cost can be reduced by right clicking the Cast button. A spell slot of equal or higher level than the spell can be expended to reduce the charge cost to one charge.

[]

When the character is ready to regain charges, the reset button next to the charge value will open a prompt to charge the stave. This will replenish the number of charges back to the default (equal to highest spell slot available) If the character has Prepared spellcasting, the player may choose a spell slot to expend to gain extra charges equal to the level of the spell slot.

[]