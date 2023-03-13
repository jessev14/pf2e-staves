export const moduleID = 'pf2e-staves';


export const lg = x => console.log(x);

const mostCommonInList = (arr) => {
    return arr.sort((a,b) =>
          arr.filter(v => v===a).length
        - arr.filter(v => v===b).length
    ).pop();
}


Hooks.once('init', () => {
    // Add Charge spell type.
    CONFIG.PF2E.spellCategories.charge = 'Charge';
    CONFIG.PF2E.preparationType.charge = 'Charge';

    // Patch spellcastingEntry#cast to use charges instead of spell slots for staves.
    libWrapper.register(moduleID, 'CONFIG.PF2E.Item.documentClasses.spellcastingEntry.prototype.cast', spellcastingEntry_cast, 'MIXED');
});


// When stave added to a character, also create corresponding spellcasting entry.
Hooks.on('createItem', async (weapon, options, userID) => {
    if (!weapon.actor) return;
    if (userID !== game.user.id) return;

    const traits = weapon.system.traits?.value;
    const isStave = traits?.includes('magical') && traits?.includes('staff');
    if (!isStave) return;

    return createStaveSpellcastingEntry(weapon, weapon.actor);
});

// When stave updated on a character, create spellcasting entry if none found. Update existing entry if found.
Hooks.on('updateItem', async (weapon, update, options, userID) => {
    if (!weapon.actor) return;
    if (userID !== game.user.id) return;

    const traits = weapon.system.traits?.value;
    const isStave = traits?.includes('magical') && traits?.includes('staff');
    if (!isStave) return;

    const { actor } = weapon;
    const existingStaveEntry = actor.spellcasting.find(s => s.flags[moduleID]?.staveID === weapon.id);
    return createStaveSpellcastingEntry(weapon, actor, existingStaveEntry);
});

// Delete spellcastingEntry associated with stave.
Hooks.on('preDeleteItem', (weapon, options, userID) => {
    const traits = weapon.system.traits?.value;
    const isStave = traits?.includes('magical') && traits?.includes('staff');
    if (!isStave) return;

    const { actor } = weapon;
    const spellcastingEntries = actor.items.filter(i => i.type === 'spellcastingEntry');
    const spellcastingEntry = spellcastingEntries.find(i => i.getFlag(moduleID, 'staveID') === weapon.id);
    if (spellcastingEntry) spellcastingEntry.delete();
});

// Implement charge spellcasting rules on character sheet.
// Hooks.on('renderCharacterSheetPF2e', (sheet, [html], sheetData) => {
Hooks.on('renderCreatureSheetPF2e', (sheet, [html], sheetData) => {
    const actor = sheet.object;
    const isPC = actor.type === 'character';

    const spellcastingLis = html.querySelectorAll('li.spellcasting-entry');
    for (const li of spellcastingLis) {
        const spellcastingEntry = actor.spellcasting.get(li.dataset.containerId);
        if (spellcastingEntry?.system?.prepared?.value !== 'charge') continue;

        let chargeEl;
        if (isPC) {
            chargeEl = document.createElement('section');
            chargeEl.innerHTML = `
                <h4 class='skill-name spellcasting'>Charges</h4>
                <input class="${moduleID}-charges" type="number" value="${spellcastingEntry.getFlag(moduleID, 'charges')}" placeholder="0">
                <a class="${moduleID}-charge"><i class="fas fa-redo"></i></a>
            `;
        } else {
            chargeEl = document.createElement('div');
            chargeEl.classList.add('inline-field');
            chargeEl.innerHTML = `
                <label>Charges</label>
                <input class="dc-input modifier adjustable" type="number" value="${spellcastingEntry.getFlag(moduleID, 'charges')}" placeholder="0">
                <a class="${moduleID}-charge"><i class="fas fa-redo"></i></a>
            `;
        }

        // Charge input.
        chargeEl.querySelector('input').addEventListener('focus', ev => {
            ev.currentTarget.select();
        });
        chargeEl.querySelector('input').addEventListener('change', async ev => {
            const { target } = ev;
            const charges = target.value;
            const clampedCharges = Math.max(0, charges);
            target.value = clampedCharges;

            await spellcastingEntry.setFlag(moduleID, 'charges', clampedCharges);
        });

        // Charge stave prompt.
        chargeEl.querySelector('a').addEventListener('click', async ev => {
            let options = ``;
            for (const li of spellcastingLis) {
                const spellcastingEntry = actor.spellcasting.get(li.dataset.containerId);
                if (spellcastingEntry?.system?.prepared?.value !== 'prepared') continue;

                const preppedSpells = [];
                for (const spellLi of li.querySelectorAll('li.item.spell')) {
                    if (spellLi.dataset.expendedState === 'true' || !parseInt(spellLi.dataset.slotLevel)) continue;

                    const spell = actor.items.get(spellLi.dataset.itemId);
                    const { entryId, slotLevel, slotId } = spellLi.dataset;
                    preppedSpells.push({
                        name: spell.name,
                        entryId,
                        slotLevel,
                        slotId
                    });
                }
                if (preppedSpells.length) {
                    options += `<optgroup label="${spellcastingEntry.name}">`
                    for (const spell of preppedSpells) {
                        options += `<option data-entry-id="${spell.entryId}" data-slot-level="${spell.slotLevel}" data-slot-id="${spell.slotId}">${spell.name} (+${spell.slotLevel})</option>`
                    }
                    options += `</optgroup>`;
                }
            }

            if (options) options = `<option></option>` + options;
            const content = options
                ? `
                    <div style="font-size: var(--font-size-13);">Expend spell slot for extra charges?</div>
                    <select style="width: 100%; margin-bottom: 5px;">
                        ${options}
                    </select>
                `
                : null;
            await Dialog.prompt({
                title: 'Charge Stave?',
                content,
                label: 'Charge',
                callback: async ([dialogHtml]) => {
                    const charges = getHighestSpellslot(actor);
                    const select = dialogHtml.querySelector('select');
                    if (!select || !select?.selectedIndex) return spellcastingEntry.setFlag(moduleID, 'charges', charges);

                    const selectedSpellOption = select.options[select.selectedIndex];
                    const { entryId, slotLevel, slotId } = selectedSpellOption.dataset;
                    const entry = actor.items.get(entryId);
                    entry.setSlotExpendedState(slotLevel, slotId, true);

                    return spellcastingEntry.setFlag(moduleID, 'charges', charges + parseInt(slotLevel));
                },
                rejectClose: false,
                options: { width: 250 }
            });
        });

        const characterHeader = li.querySelector('div.statistic-values');
        const npcHeader = li.querySelector('h4.name');
        if (isPC) characterHeader.appendChild(chargeEl);
        else npcHeader.after(chargeEl);

        // Add spontaneous spellcasting rules to Cast button right click.
        const castButtons = li.querySelectorAll('button.cast-spell');
        castButtons.forEach(button => {
            button.addEventListener('contextmenu', () => {
                const spellLi = button.closest('li.item.spell');
                const { itemId, slotLevel, slotId, entryId } = spellLi.dataset;
                const collection = actor.spellcasting.collections.get(entryId, { strict: true });
                const spell = collection.get(itemId, { strict: true });
                collection.entry.cast(spell, { level: slotLevel, [`${moduleID}Spontaneous`]: true });
            });
        });

        // Add .slotless-level-toggle button.
        const slotToggleButton = document.createElement('a');
        slotToggleButton.title = 'Toggle visibility of spell levels without slots';
        slotToggleButton.classList.add('skill-name', 'slotless-level-toggle');
        slotToggleButton.innerHTML = `<i class="fas fa-list-alt"></i>`;
        slotToggleButton.addEventListener('click', async ev => {
            ev.preventDefault();

            const spellcastingID = $(ev.currentTarget).parents(".item-container").attr("data-container-id") ?? "";
            if (!spellcastingID) return;

            const spellcastingEntry = actor.items.get(spellcastingID);
            const bool = !(spellcastingEntry?.system?.showSlotlessLevels || {}).value;
            await spellcastingEntry.update({
                "system.showSlotlessLevels.value": bool,
            });
        });

        const itemControls = li.querySelector('div.item-controls');
        itemControls.prepend(slotToggleButton);
    }
});


async function createStaveSpellcastingEntry(stave, actor, existingEntry = null) {
    const spells = [];
    const description = stave.system.description.value;
    const slotLevels = ['Cantrips?', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th'];
    for (let i = 0; i < slotLevels.length; i++) {
        const regex = new RegExp(`${slotLevels[i]}.*@(UUID|Compendium).*\n`);
        const match = description.match(regex);
        if (!match) continue;

        const strs = match[0].match(/(@UUID\[Compendium\.|@Compendium\[)(.*?)].*?}/g);
        for (const str of strs) {
            const UUID = str.split('[')[1].split(']')[0].replace('Compendium.', '');
            const spell = await fromUuid("Compendium." + UUID);
            if (!spell || spell?.type !== 'spell') continue;

            let spellClone;
            if (spell.id) spellClone = spell.clone({ 'system.location.heightenedLevel': i });
            else {
                const { pack, _id } = spell;
                const spellFromPack = await game.packs.get(pack)?.getDocuments().find(s => s.id === _id);
                spellClone = spellFromPack.clone({ 'system.location.heightenedLevel': i });
            }

            spells.push(spellClone);
        }
    }

    if (!spells.length) { // fallback
        const UUIDs = description.match(/(@UUID\[Compendium\.|@Compendium\[)(.*?)].*?}/g);
        if (!UUIDs) return;

        for (const str of UUIDs) {
            const UUID = str.split('[')[1].split(']')[0].replace('Compendium.', '');
            const spell = await fromUuid("Compendium." + UUID);
            if (!spell || spell?.type !== 'spell') continue;

            if (spell.id) spells.push(spell);
            else {
                const { pack, _id } = spell;
                const spellFromPack = await game.packs.get(pack)?.getDocuments().find(s => s.id === _id);
                if (spellFromPack) spells.push(spellFromPack);
            }
        }
    }

    if (!spells.length) return;

    if (!existingEntry) {
        const highestMentalAbilityValue = Math.max(...Object.keys(actor.abilities).filter(abi => ['cha', 'int', 'wis'].includes(abi)).map(abi => actor.abilities[abi].value));
        // picking best mental ability; not always correct, but it's a good rule of thumb
        const bestMentalAbility = Object.keys(actor.abilities).find(abi => actor.abilities[abi].value === highestMentalAbilityValue);
        // rule of thumb for tradition is to pick whatever exists in other spellcasting entries
        const mostCommonTradition = mostCommonInList(actor.spellcasting.map(se => se.system.tradition.value));
        const createData = {
            type: 'spellcastingEntry',
            name: stave.name,
            system: {
                prepared: {
                    value: 'charge'
                },
                ability: {
                    value: bestMentalAbility
                },
                tradition: {
                    value: mostCommonTradition
                },
                showSlotlessLevels: {
                    value: false
                }
            },
            flags: {
                [moduleID]: {
                    staveID: stave.id,
                    charges: getHighestSpellslot(actor)
                }
            }
        }
        const [spellcastingEntry] = await actor.createEmbeddedDocuments('Item', [createData]);
        for (const spell of spells) await spellcastingEntry.addSpell(spell);
    } else {
        for (const spell of existingEntry.spells) await spell.delete();
        for (const spell of spells) await existingEntry.addSpell(spell);
    }
}

function getHighestSpellslot(actor) {
    let charges = 0;
    actor.spellcasting.forEach(entry => {
        if (entry.flags[moduleID]) return;

        let i = 0;
        Object.values(entry.system.slots).forEach(slot => {
            if (slot.max && charges < i) charges = i;
            i++;
        });
    });

    return charges;
}

async function spellcastingEntry_cast(wrapped, spell, options) {
    if (!spell.spellcasting.flags[moduleID] || spell.isCantrip) return wrapped(spell, options);

    options.consume = false;
    if (options[`${moduleID}Override`]) return wrapped(spell, options);

    const { actor } = spell;
    const charges = spell.spellcasting.getFlag(moduleID, 'charges');
    if (options[`${moduleID}Spontaneous`]) {
        if (!charges) return ui.notifications.warn('You do not have enough stave charges to cast this spell.');

        const select = document.createElement('select');
        select.style.width = '100%';
        select.style['margin-bottom'] = '5px';
        for (const entry of actor.spellcasting) {
            if (entry.system.prepared.value !== 'spontaneous') continue;
            select.innerHTML += `<optgroup label="${entry.name}">`;
            for (let i = parseInt(options.level); i < 12; i++) {
                const currentSlotLevel = Object.values(entry.system.slots)[i];
                const { value, max } = currentSlotLevel;
                if (value) select.innerHTML += `<option value="${entry.id}-${i}">Level ${i} Slot (${value}/${max})</option>`;
            }

            select.innerHTML += `</optgroup>`;
        }
        if (!select.length) return ui.notifications.warn('You do not have any Spontaneous spell slots available to cast this spell.');

        await Dialog.prompt({
            title: 'Use Spell Slot?',
            content: select.outerHTML,
            label: 'Consume Spell Slot',
            callback: async ([html]) => {
                const select = html.querySelector('select');
                const [entryID, selectedLevel] = select.value.split('-');
                const entry = actor.spellcasting.get(entryID);
                const currentSlots = entry.system.slots[`slot${selectedLevel}`].value;

                await actor.spellcasting.get(entryID).update({ [`system.slots.slot${selectedLevel}.value`]: currentSlots - 1 });
                await spell.spellcasting.setFlag(moduleID, 'charges', charges - 1);
                options[`${moduleID}Override`] = true;
                return spell.spellcasting.cast(spell, options);
            },
            rejectClose: false,
            options: { width: 250 }
        });

    } else {
        if (spell.level > charges) return ui.notifications.warn('You do not have enough stave charges to cast this spell.');

        await spell.spellcasting.setFlag(moduleID, 'charges', charges - spell.level);
        return wrapped(spell, options);
    }
}
